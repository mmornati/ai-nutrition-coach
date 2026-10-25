// Automatic, silent backup to the relay for one unlocked session (docs/encrypted-sync-plan.md §3.6,
// "After joining"). It owns when a round runs; `runSyncCycle` owns what a round does.
//
//   a write            -> the persisted flag is set; a push is scheduled ~30 s after the LAST write
//   the page is hidden -> a pending push runs now (the page may not come back)
//   the network is back-> a failed push is tried again
//   a failure          -> retried with a growing wait (1 min, 2, 4 ... 15), never in a tight loop
//   a refusal that retrying cannot fix (rollback, a newer app, a revoked token) -> automatic backup
//                         stops and says so; "Back up now" tries again
//
// It only runs while the store is unlocked (the session is built on unlock and disposed on lock),
// and only while online. Nothing here reads or writes a plate, a note or a food name: it moves a
// sealed snapshot. The status chip is deliberately NOT driven from here (see ADR 0007, "Phase S2").

import { decodeBase64Url, type VaultStore } from '@anc/core';
import type { KeyValueStore } from '../../storage/key-value-store';
import type { RelayClient } from './client';
import {
  clearConnection,
  readConnection,
  writeConnection,
  type RelayConnection,
} from './connection';
import { importVaultKey, type RandomSource } from './crypto';
import { runSyncCycle, type CycleConnection, type CycleResult, type StopReason } from './cycle';
import { VAULT_OP_ID, type DirtyFlagSyncQueue } from './dirty-queue';
import { createRelaySyncAdapter } from './relay-adapter';
import { syncOp } from '@anc/core';

export type SyncPhase =
  /** Everything on this device was acknowledged by the relay. */
  | 'backedUp'
  /** There are changes; a push is scheduled. */
  | 'pending'
  | 'syncing'
  /** No connection to the server right now; will retry. */
  | 'offline'
  /** The server did not take it; will retry. */
  | 'failed'
  | 'needsUpdate'
  | 'rolledBack'
  | 'signedOut'
  | 'tooLarge'
  /** Anything else that stops the automatic backup (damaged copy, clock, store). */
  | 'paused';

export type SyncStatus =
  | { readonly connected: false }
  | {
      readonly connected: true;
      readonly handle: string;
      readonly phase: SyncPhase;
      /** When this session last got an acknowledgement (null until it does). */
      readonly backedUpAt: number | null;
    };

const NOT_CONNECTED: SyncStatus = Object.freeze({ connected: false });

export interface SyncEvents {
  /** The page went to the background. */
  onHidden(listener: () => void): () => void;
  /** The browser says it is online again. */
  onOnline(listener: () => void): () => void;
}

export interface SyncTimers {
  /** Runs `fn` once after `ms`; the returned function cancels it. */
  set(fn: () => void, ms: number): () => void;
}

export interface SyncServiceDeps {
  readonly kv: KeyValueStore;
  readonly vault: VaultStore;
  readonly client: RelayClient;
  readonly queue: DirtyFlagSyncQueue;
  readonly now?: () => number;
  readonly isOnline?: () => boolean;
  readonly events?: SyncEvents;
  readonly timers?: SyncTimers;
  /** The relay's vault cap in bytes (from its config); a safe default until it is known. */
  readonly maxVaultBytes?: () => number;
  readonly random?: RandomSource;
  /** Wait after the last write before a push. Default 30 s. */
  readonly debounceMs?: number;
  /** Wait before the first push of a session that starts with changes pending. Default 5 s. */
  readonly startDelayMs?: number;
}

export const DEFAULT_DEBOUNCE_MS = 30_000;
const DEFAULT_START_DELAY_MS = 5_000;
const BACKOFF_FIRST_MS = 60_000;
const BACKOFF_MAX_MS = 15 * 60_000;
export const DEFAULT_MAX_VAULT_BYTES = 20 * 1024 * 1024;

const browserEvents: SyncEvents = {
  onHidden(listener) {
    if (typeof document === 'undefined') return () => undefined;
    const handler = (): void => {
      if (document.visibilityState === 'hidden') listener();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  },
  onOnline(listener) {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener('online', listener);
    return () => window.removeEventListener('online', listener);
  },
};

const browserTimers: SyncTimers = {
  set(fn, ms) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

const phaseOfStop: Readonly<Record<StopReason, SyncPhase>> = {
  needsUpdate: 'needsUpdate',
  rolledBack: 'rolledBack',
  signedOut: 'signedOut',
  tooLarge: 'tooLarge',
  damaged: 'paused',
  clockAhead: 'paused',
  storeProblem: 'paused',
};

/** What "Back up now" answers. */
export type SyncNowOutcome =
  | { readonly kind: 'backedUp' }
  | { readonly kind: 'notConnected' }
  | {
      readonly kind: 'retryLater';
      readonly reason: 'offline' | 'unavailable' | 'rateLimited' | 'conflict';
    }
  | { readonly kind: 'stopped'; readonly reason: StopReason }
  | { readonly kind: 'locked' };

export class SyncService {
  readonly #deps: SyncServiceDeps;
  readonly #queue: DirtyFlagSyncQueue;
  readonly #now: () => number;
  readonly #listeners = new Set<() => void>();
  readonly #offs: (() => void)[] = [];
  readonly #adapter;
  #connection: (RelayConnection & CycleConnection) | null = null;
  #vaultKey: CryptoKey | null = null;
  #status: SyncStatus = NOT_CONNECTED;
  #backedUpAt: number | null = null;
  #cancelTimer: (() => void) | null = null;
  #failures = 0;
  #halted: StopReason | null = null;
  #running: Promise<CycleResult> | null = null;
  #disposed = false;

  constructor(deps: SyncServiceDeps) {
    this.#deps = deps;
    this.#queue = deps.queue;
    this.#now = deps.now ?? Date.now;
    this.#adapter = createRelaySyncAdapter({
      connected: () => this.#connection !== null,
      run: () => this.#runCycle(),
    });
    const events = deps.events ?? browserEvents;
    this.#offs.push(
      events.onHidden(() => {
        // The page may not come back: send now what is waiting.
        if (this.#shouldAutoRun()) void this.#pump();
      }),
      events.onOnline(() => {
        if (this.#shouldAutoRun()) void this.#pump();
      }),
    );
  }

  // ── observation (useSyncExternalStore) ──────────────────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = (): SyncStatus => this.#status;

  get connected(): boolean {
    return this.#connection !== null;
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────────────────────

  /** Reads this device's connection (if any) and the stored flag. Call once per session. Never throws. */
  async start(): Promise<void> {
    const connection = await readConnection(this.#deps.kv).catch(() => null);
    await this.#queue.load(connection !== null);
    if (this.#disposed || connection === null) return;
    if (!(await this.#adopt(connection))) return;
    if (this.#queue.dirty) {
      this.#set('pending');
      this.#schedule(this.#deps.startDelayMs ?? DEFAULT_START_DELAY_MS);
    } else {
      this.#set('backedUp');
    }
  }

  /**
   * This device has just been connected (the connection is already stored). `dirty`: whether it has
   * something the relay does not (a join that merged, or a write during the signup).
   */
  async connect(connection: RelayConnection, dirty: boolean): Promise<boolean> {
    if (!(await this.#adopt(connection))) return false;
    this.#halted = null;
    this.#failures = 0;
    this.#queue.setConnected(true, dirty);
    this.#set(dirty ? 'pending' : 'backedUp');
    return true;
  }

  /** Forgets the connection on this device. The relay's copy is not touched. */
  async disconnect(): Promise<boolean> {
    this.#cancel();
    this.#connection = null;
    this.#vaultKey = null;
    this.#halted = null;
    // A cycle still in flight belongs to the connection that is going away: it must not settle
    // (or be shared with) whatever this device connects to next.
    this.#running = null;
    this.#queue.setConnected(false);
    this.#status = NOT_CONNECTED;
    this.#emit();
    try {
      await clearConnection(this.#deps.kv);
      return true;
    } catch {
      return false;
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancel();
    for (const off of this.#offs.splice(0)) off();
    this.#listeners.clear();
    this.#connection = null;
    this.#vaultKey = null;
  }

  // ── writes, and the explicit button ─────────────────────────────────────────────────────────

  /** A change was made on this device. */
  noteWrite(): void {
    if (this.#connection === null || this.#disposed) return;
    this.#queue.markDirty();
    if (this.#halted !== null || this.#running !== null) return;
    this.#set('pending');
    this.#schedule(this.#deps.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  }

  /** "Back up now" (and the join): a round now, whatever stopped the automatic ones. */
  async syncNow(): Promise<SyncNowOutcome> {
    if (this.#connection === null) return { kind: 'notConnected' };
    this.#cancel();
    this.#halted = null;
    const result = await this.#pump();
    switch (result.kind) {
      case 'upToDate':
      case 'pushed':
        return { kind: 'backedUp' };
      case 'retry':
        return { kind: 'retryLater', reason: result.reason };
      case 'stopped':
        return { kind: 'stopped', reason: result.reason };
      case 'locked':
        return { kind: 'locked' };
    }
  }

  // ── internals ───────────────────────────────────────────────────────────────────────────────

  async #adopt(connection: RelayConnection): Promise<boolean> {
    const raw = decodeBase64Url(connection.vaultKey);
    if (raw === null) return false;
    try {
      this.#vaultKey = await importVaultKey(raw);
    } catch {
      return false;
    } finally {
      raw.fill(0);
    }
    this.#connection = {
      handle: connection.handle,
      token: connection.token,
      vaultKey: connection.vaultKey,
      vaultId: connection.vaultId,
      lastSeenVersion: connection.lastSeenVersion,
    };
    return true;
  }

  #shouldAutoRun(): boolean {
    return (
      !this.#disposed &&
      this.#connection !== null &&
      this.#halted === null &&
      this.#running === null &&
      this.#queue.dirty
    );
  }

  #runCycle(): Promise<CycleResult> {
    const connection = this.#connection;
    const key = this.#vaultKey;
    if (connection === null || key === null) return Promise.resolve({ kind: 'locked' });
    return runSyncCycle({
      connection,
      isCurrent: () => this.#connection === connection,
      vaultKey: key,
      client: this.#deps.client,
      vault: this.#deps.vault,
      kv: this.#deps.kv,
      queue: this.#queue,
      maxVaultBytes: this.#deps.maxVaultBytes?.() ?? DEFAULT_MAX_VAULT_BYTES,
      now: this.#now,
      ...(this.#deps.random ? { random: this.#deps.random } : {}),
    });
  }

  /** One attempt, shared by every caller that asks while it runs. */
  #pump(): Promise<CycleResult> {
    if (this.#running !== null) return this.#running;
    this.#cancel();
    const attempt: Promise<CycleResult> = this.#attempt().finally(() => {
      if (this.#running === attempt) this.#running = null;
    });
    this.#running = attempt;
    return attempt;
  }

  async #attempt(): Promise<CycleResult> {
    const connection = this.#connection;
    this.#set('syncing');
    const isOnline =
      this.#deps.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
    let result: CycleResult;
    if (!isOnline()) {
      result = { kind: 'retry', reason: 'offline' };
    } else {
      const op = syncOp({
        opId: VAULT_OP_ID,
        plateLogId: 0,
        enqueuedAtUtc: this.#now(),
        kind: 'plateLogUpdated',
      });
      const drained = await this.#adapter.drain(op);
      result = this.#adapter.lastCycle ?? { kind: 'retry', reason: 'unavailable' };
      if (drained.kind === 'drained' && this.#connection === connection) {
        await this.#queue.markSynced(VAULT_OP_ID);
      }
    }
    // Disconnected (or connected elsewhere) while this ran: its outcome says nothing about now.
    if (this.#disposed || this.#connection !== connection) return result;
    this.#settle(result);
    return result;
  }

  #settle(result: CycleResult): void {
    switch (result.kind) {
      case 'upToDate':
      case 'pushed':
        this.#failures = 0;
        if (result.kind === 'pushed') this.#backedUpAt = this.#now();
        if (this.#queue.dirty) {
          // A write landed while this was in flight: another round, after the usual wait.
          this.#set('pending');
          this.#schedule(this.#deps.debounceMs ?? DEFAULT_DEBOUNCE_MS);
        } else {
          this.#set('backedUp');
        }
        return;
      case 'retry': {
        this.#failures++;
        this.#set(result.reason === 'offline' ? 'offline' : 'failed');
        const backoff = Math.min(BACKOFF_MAX_MS, BACKOFF_FIRST_MS * 2 ** (this.#failures - 1));
        const wait = Math.max(backoff, (result.retryAfterSeconds ?? 0) * 1000);
        this.#schedule(wait);
        return;
      }
      case 'stopped':
        this.#halted = result.reason;
        this.#set(phaseOfStop[result.reason]);
        return;
      case 'locked':
        // The session is ending; the flag stays set and the next unlock starts again.
        this.#set(this.#queue.dirty ? 'pending' : 'backedUp');
        return;
    }
  }

  #schedule(ms: number): void {
    this.#cancel();
    if (this.#disposed || this.#connection === null) return;
    const timers = this.#deps.timers ?? browserTimers;
    this.#cancelTimer = timers.set(() => {
      this.#cancelTimer = null;
      if (this.#shouldAutoRun()) void this.#pump();
    }, ms);
  }

  #cancel(): void {
    this.#cancelTimer?.();
    this.#cancelTimer = null;
  }

  #set(phase: SyncPhase): void {
    const connection = this.#connection;
    if (connection === null) return;
    const current = this.#status;
    if (
      current.connected &&
      current.phase === phase &&
      current.handle === connection.handle &&
      current.backedUpAt === this.#backedUpAt
    ) {
      return;
    }
    this.#status = Object.freeze({
      connected: true as const,
      handle: connection.handle,
      phase,
      backedUpAt: this.#backedUpAt,
    });
    this.#emit();
  }

  #emit(): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch {
        // A throwing subscriber must not break the others.
      }
    }
  }
}

/** Persists a freshly made connection and hands it to the service. */
export async function adoptConnection(
  service: SyncService,
  kv: KeyValueStore,
  connection: RelayConnection,
  dirty: boolean,
): Promise<boolean> {
  await writeConnection(kv, connection, dirty);
  return service.connect(connection, dirty);
}
