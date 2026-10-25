// Automatic, silent sync with the relay for one unlocked session (docs/encrypted-sync-plan.md §3.6,
// "After joining"). It owns when a round runs; `runSyncCycle` owns what a round does.
//
//   unlock             -> a pull a moment after the session starts (a push first if changes wait)
//   focus / visible    -> a pull, at most one per `pullIntervalMs` (focus churn must stay cheap:
//                         an unchanged vault is a 304)
//   the network is back-> a round (failed ones are tried again; no throttle: the wait was real)
//   a write            -> the persisted flag is set; a push is scheduled ~30 s after the LAST write
//   the page is hidden -> a pending push runs now (the page may not come back)
//   a failure          -> retried with a growing wait (1 min, 2, 4 ... 15), never in a tight loop
//   a refusal that retrying cannot fix (rollback, a newer app, a revoked token) -> sync stops and
//                         says so; "Back up now" tries again
//
// It only runs while the store is unlocked (the session is built on unlock and disposed on lock),
// and only while online. Nothing here reads or writes a plate, a note or a food name: it moves a
// sealed snapshot.
//
// What the chip says (AD-6) is derived here from the ledger (`ledger.ts`), which the cycle feeds with
// exactly what the relay acknowledged or handed over: a plate is `synced` only when a snapshot
// that contained it was durably acknowledged (or fetched); one written after the snapshot was read
// stays `pending`. The statuses go out through the `SyncQueue` port (`watchPerPlate`), and the
// `SyncAdapter` port is the transport that produces the acknowledgements.

import { decodeBase64Url, type SyncOpStatusValue, type VaultStore } from '@anc/core';
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
import { SyncLedger } from './ledger';
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
      /**
       * Whether this device knows what the server holds. Until it does (a connection from before
       * the ledger existed, for a moment after unlock), "synced" is not claimed.
       */
      readonly known: boolean;
      /** Whether this device has changes the relay has not acknowledged. */
      readonly dirty: boolean;
    };

const NOT_CONNECTED: SyncStatus = Object.freeze({ connected: false });

export interface SyncEvents {
  /** The page went to the background. */
  onHidden(listener: () => void): () => void;
  /** The browser says it is online again. */
  onOnline(listener: () => void): () => void;
  /** The page came back to the foreground (`visibilitychange` to visible). */
  onVisible?(listener: () => void): () => void;
  /** The window got focus. */
  onFocus?(listener: () => void): () => void;
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
  /** Wait before the pull that follows an unlock. Default 1 s. */
  readonly pullDelayMs?: number;
  /** No pull from focus or visibility more often than this. Default 45 s. */
  readonly pullIntervalMs?: number;
  /** The record of what the relay holds (tests share one). */
  readonly ledger?: SyncLedger;
}

export const DEFAULT_DEBOUNCE_MS = 30_000;
const DEFAULT_START_DELAY_MS = 5_000;
export const DEFAULT_PULL_DELAY_MS = 1_000;
export const DEFAULT_PULL_INTERVAL_MS = 45_000;
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
  onVisible(listener) {
    if (typeof document === 'undefined') return () => undefined;
    const handler = (): void => {
      if (document.visibilityState === 'visible') listener();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  },
  onFocus(listener) {
    if (typeof window === 'undefined') return () => undefined;
    window.addEventListener('focus', listener);
    return () => window.removeEventListener('focus', listener);
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
  readonly #ledger: SyncLedger;
  readonly #now: () => number;
  readonly #listeners = new Set<() => void>();
  readonly #remoteListeners = new Set<() => void>();
  readonly #offs: (() => void)[] = [];
  readonly #adapter;
  #connection: (RelayConnection & CycleConnection) | null = null;
  #vaultKey: CryptoKey | null = null;
  #status: SyncStatus = NOT_CONNECTED;
  #phase: SyncPhase = 'backedUp';
  #backedUpAt: number | null = null;
  #cancelTimer: (() => void) | null = null;
  #failures = 0;
  #halted: StopReason | null = null;
  #running: Promise<CycleResult> | null = null;
  #lastAttemptAt = Number.NEGATIVE_INFINITY;
  #remoteRevision = 0;
  #plateSeq = 0;
  #plateRefreshScheduled = false;
  #offLedger: (() => void) | null = null;
  #disposed = false;

  constructor(deps: SyncServiceDeps) {
    this.#deps = deps;
    this.#queue = deps.queue;
    this.#ledger = deps.ledger ?? new SyncLedger(deps.kv);
    this.#now = deps.now ?? Date.now;
    this.#adapter = createRelaySyncAdapter({
      connected: () => this.#connection !== null,
      run: () => this.#runCycle(),
    });
    const events = deps.events ?? browserEvents;
    this.#offs.push(
      events.onHidden(() => {
        // The page may not come back: send now what is waiting.
        if (this.#canRun() && this.#queue.dirty) void this.#pump();
      }),
      events.onOnline(() => {
        // The wait was real: no throttle, but never two rounds at once.
        if (this.#canRun()) void this.#pump();
      }),
    );
    // Coming back to the page or the window is when another device's work is worth fetching.
    const pullOnReturn = (): void => this.#pullIfDue();
    const off = [events.onVisible?.(pullOnReturn), events.onFocus?.(pullOnReturn)];
    for (const stop of off) if (stop) this.#offs.push(stop);
  }

  // ── observation (useSyncExternalStore) ──────────────────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getSnapshot = (): SyncStatus => this.#status;

  /**
   * A copy pulled from the relay changed what this device holds: whatever the screens cache beyond
   * the live store watches (the profile, the language, the saved lists) reads it again.
   */
  onRemoteChange = (listener: () => void): (() => void) => {
    this.#remoteListeners.add(listener);
    return () => {
      this.#remoteListeners.delete(listener);
    };
  };

  /** Counts the pulls that changed something (for `useSyncExternalStore`). */
  getRemoteRevision = (): number => this.#remoteRevision;

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
    await this.#ledger.load();
    if (this.#disposed) return;
    this.#watchLedger();
    if (this.#queue.dirty) {
      this.#set('pending');
      this.#schedule(this.#deps.startDelayMs ?? DEFAULT_START_DELAY_MS);
    } else {
      this.#set('backedUp');
      // Unlocking is the moment to look for what the other devices did.
      this.#schedule(this.#deps.pullDelayMs ?? DEFAULT_PULL_DELAY_MS);
    }
    this.#refreshPlates();
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
    // What the flow that made the connection told the relay is already stored with it.
    await this.#ledger.load();
    this.#watchLedger();
    this.#set(dirty ? 'pending' : 'backedUp');
    this.#refreshPlates();
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
    this.#offLedger?.();
    this.#offLedger = null;
    this.#queue.setConnected(false);
    this.#queue.setPlateStatuses([]);
    this.#status = NOT_CONNECTED;
    this.#emit();
    this.#ledger.forget();
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
    this.#offLedger?.();
    this.#offLedger = null;
    this.#listeners.clear();
    this.#remoteListeners.clear();
    this.#connection = null;
    this.#vaultKey = null;
  }

  // ── writes, and the explicit button ─────────────────────────────────────────────────────────

  /** A change was made on this device. */
  noteWrite(): void {
    if (this.#connection === null || this.#disposed) return;
    this.#queue.markDirty();
    // A new plate shows as pending at once (it is in no acknowledged snapshot).
    this.#publish();
    this.#refreshPlates();
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

  #watchLedger(): void {
    this.#offLedger?.();
    this.#offLedger = this.#ledger.subscribe(() => {
      // What the relay holds changed: the status line and the plates' chips follow.
      this.#publish();
      this.#refreshPlates();
    });
  }

  /** Whether an automatic round may start now: connected, not stopped, not already running. */
  #canRun(): boolean {
    return (
      !this.#disposed &&
      this.#connection !== null &&
      this.#halted === null &&
      this.#running === null
    );
  }

  /** A pull because the person came back to the page; at most one per interval. */
  #pullIfDue(): void {
    if (!this.#canRun()) return;
    // Offline there is nothing to ask; the browser tells us when the network is back.
    const isOnline =
      this.#deps.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
    if (!isOnline()) return;
    const interval = this.#deps.pullIntervalMs ?? DEFAULT_PULL_INTERVAL_MS;
    if (this.#now() - this.#lastAttemptAt < interval) return;
    void this.#pump();
  }

  #runCycle(): Promise<CycleResult> {
    const connection = this.#connection;
    const key = this.#vaultKey;
    if (connection === null || key === null) return Promise.resolve({ kind: 'locked' });
    return runSyncCycle({
      connection,
      isCurrent: () => this.#connection === connection && !this.#disposed,
      vaultKey: key,
      client: this.#deps.client,
      vault: this.#deps.vault,
      kv: this.#deps.kv,
      queue: this.#queue,
      maxVaultBytes: this.#deps.maxVaultBytes?.() ?? DEFAULT_MAX_VAULT_BYTES,
      now: this.#now,
      onHeld: (snapshot) => this.#ledger.hold(snapshot),
      onApplied: () => {
        this.#remoteRevision++;
        for (const listener of [...this.#remoteListeners]) {
          try {
            listener();
          } catch {
            // A throwing subscriber must not break the others.
          }
        }
        this.#emit();
      },
      ...(this.#deps.random ? { random: this.#deps.random } : {}),
    });
  }

  /** One attempt, shared by every caller that asks while it runs. */
  #pump(): Promise<CycleResult> {
    if (this.#running !== null) return this.#running;
    this.#cancel();
    const attempt: Promise<CycleResult> = this.#attempt().finally(() => {
      if (this.#running === attempt) this.#running = null;
      // Whatever the round did, the chips are read once it is over (never half way through).
      this.#refreshPlates();
    });
    this.#running = attempt;
    return attempt;
  }

  async #attempt(): Promise<CycleResult> {
    const connection = this.#connection;
    this.#lastAttemptAt = this.#now();
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
      // A scheduled round is wanted whatever the reason (a push, a pull, a retry after a failure).
      if (this.#canRun()) void this.#pump();
    }, ms);
  }

  #cancel(): void {
    this.#cancelTimer?.();
    this.#cancelTimer = null;
  }

  #set(phase: SyncPhase): void {
    this.#phase = phase;
    this.#publish();
    this.#refreshPlates();
  }

  #publish(): void {
    const connection = this.#connection;
    if (connection === null) return;
    const phase = this.#phase;
    const known = this.#ledger.known;
    const dirty = this.#queue.dirty;
    const current = this.#status;
    if (
      current.connected &&
      current.phase === phase &&
      current.handle === connection.handle &&
      current.backedUpAt === this.#backedUpAt &&
      current.known === known &&
      current.dirty === dirty
    ) {
      return;
    }
    this.#status = Object.freeze({
      connected: true as const,
      handle: connection.handle,
      phase,
      backedUpAt: this.#backedUpAt,
      known,
      dirty,
    });
    this.#emit();
  }

  /**
   * The chip of every plate, from the ledger: `synced` when a snapshot the relay acknowledged (or
   * handed over) held the plate, otherwise `pending`, or `failed` ("retry later") while the last
   * round did not go through or sync is stopped. Coalesced, and never read half way through a round.
   */
  #refreshPlates(): void {
    if (this.#plateRefreshScheduled || this.#disposed) return;
    this.#plateRefreshScheduled = true;
    queueMicrotask(() => {
      this.#plateRefreshScheduled = false;
      if (this.#running !== null) return; // read again when the round is over
      void this.#computePlates(++this.#plateSeq);
    });
  }

  async #computePlates(seq: number): Promise<void> {
    const connection = this.#connection;
    if (connection === null) {
      this.#queue.setPlateStatuses([]);
      return;
    }
    let identities;
    try {
      identities = await this.#deps.vault.readPlateIdentities();
    } catch {
      return;
    }
    if (identities.kind !== 'vault') return;
    // Superseded, or this device was disconnected (or locked) while the read was in flight.
    if (seq !== this.#plateSeq || this.#connection !== connection || this.#disposed) return;
    const trouble = this.#halted !== null || this.#phase === 'failed';
    const waiting: SyncOpStatusValue = trouble ? 'failed' : 'pending';
    this.#queue.setPlateStatuses(
      identities.value.map((identity) => ({
        plateLogId: identity.plateLogId,
        status: this.#ledger.holds(identity.uid) ? ('synced' as const) : waiting,
      })),
    );
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
