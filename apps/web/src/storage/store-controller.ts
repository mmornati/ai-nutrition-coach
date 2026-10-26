// The store's state machine.
//
//   checking -> needsPassphraseCreation --createStore--> unlocked
//            -> locked                  --unlock-------> unlocked
//            -> unavailable (browser storage cannot be used or read right now) -> retry
//            -> needsReset (header corrupt / data orphaned or missing) -> erase
//   unlocked --lock / idle / page hidden / worker died--> locked
//
// `unavailable` and `needsReset` are different things and never share an exit: a READ that fails
// (localStorage throws, IndexedDB blocked, OPFS in a transient state or held by another tab) says
// nothing about the data, so it only ever offers "try again". Only content that is positively
// bad (a corrupt header, database bytes with no header, a header whose data is gone) reaches
// `needsReset`, whose one exit is the explicit erase.
//
// It owns the three things that must never drift apart: the persisted header (salt + KDF
// parameters + format version), the keyed database (through the injected `StoreBackend`) and the
// tab lock. Everything is injected, so the exact production logic runs in unit tests against an
// in-process engine and an in-memory header; only the browser adapters (localStorage, the
// IndexedDB header copy, Web Locks, the worker) are browser-only.
//
// Invariants (each pinned by store-controller.test.ts):
//   - The key is derived and held INSIDE the worker, only while the database is being opened. A
//     wrong passphrase can never open the store: sqlite3mc's page decryption fails, so there is no
//     "any passphrase works" path and nothing is written.
//   - The header is written only after a creation succeeded; a returning user whose data is gone
//     gets `needsReset`, never a fresh empty store. A store that cannot be INSPECTED is
//     `unavailable`, never `needsReset` and never a first run.
//   - `lock` flips the status and drops the database handle BEFORE awaiting the close, so the UI
//     never shows data after a lock; closing terminates the worker (frees the key's wasm heap).
//     The docs never claim forensic erasure from RAM.
//   - Unlock throttling is UX friction only (see passphrase.ts). It is not a security control.

import {
  DEFAULT_HIDDEN_LOCK_MS,
  DEFAULT_IDLE_MINUTES,
  IDLE_MINUTE_CHOICES,
  LOCK_IDLE_MINUTES_KEY,
  STORE_META_KEY,
} from './constants';
import type { StoreBackend } from './backend';
import { wipe } from './bytes';
import { requestDurableStorage, type DurableStorage } from './durable-storage';
import { classifyOpenError, StoreUnavailableError, type UnavailableReason } from './errors';
import {
  createStoreMeta,
  encodeStoreMeta,
  parseStoreMeta,
  type StoreMeta,
  type StoreMetaRead,
} from './header';
import {
  DEFAULT_KDF_PARAMS,
  isSecureCryptoAvailable,
  KDF_MIN_ITERATIONS,
  STORE_SALT_BYTES,
  type KdfParams,
} from './kdf';
import type { StoreLock, StoreLockHandle } from './locks';
import type { MetaStorage } from './meta-storage';
import type { StoreDb } from './ops';
import { observeWrites } from './write-observer';
import {
  passphraseBytes,
  unlockDelayMs,
  validateNewPassphrase,
  type PassphraseIssue,
} from './passphrase';
import type { StoreSource } from './store-source';
import { probeStorageAvailability, type StorageAvailability } from './storage-probe';

/** Where the store is in its lifecycle. */
export type StoreStatus =
  /** `initialize` has not finished. */
  | 'checking'
  /** First run: no store yet; the user must create a passphrase. */
  | 'needsPassphraseCreation'
  /** A store exists; the passphrase is needed. */
  | 'locked'
  /** Key verified, database open. */
  | 'unlocked'
  /**
   * The browser cannot use (or right now cannot read) its storage: no OPFS, plain HTTP, a refused
   * localStorage / IndexedDB read, an OPFS hiccup, another tab holding the files. Says nothing
   * about the data. The way forward is `retry()`; erase is NOT offered.
   */
  | 'unavailable'
  /**
   * The header is corrupt, or database bytes exist with no header, or the header's data is gone;
   * the only way forward is the explicit erase.
   */
  | 'needsReset'
  /** An erase is in progress. */
  | 'erasing';

/** Outcome of `createStore` / `unlock`. A union: callers must handle each. */
export type UnlockOutcome =
  | { readonly kind: 'unlocked' }
  /** The passphrase does not open the store. `retryAfterMs` is the delay now in force. */
  | { readonly kind: 'wrongPassphrase'; readonly retryAfterMs: number }
  /** Too soon after repeated failures (or another attempt is running). */
  | { readonly kind: 'throttled'; readonly retryAfterMs: number }
  /** A NEW passphrase failed the strength floor. */
  | { readonly kind: 'passphraseRejected'; readonly issue: PassphraseIssue }
  /**
   * The browser storage or the wasm cipher could not be used (private mode, blocked storage, the
   * engine missing, plain HTTP). Never the user's passphrase.
   */
  | { readonly kind: 'storeUnavailable'; readonly reason: UnavailableReason }
  /** Another tab of this origin holds the store open. Try again once it has locked. */
  | { readonly kind: 'inUseElsewhere' }
  /** Written by a newer build than the one running: reload to update. Not a wrong passphrase. */
  | { readonly kind: 'newerVersion' }
  /** The header promised data that is gone. The status becomes `needsReset`. */
  | { readonly kind: 'dataMissing' };

export interface StoreSnapshot {
  readonly status: StoreStatus;
  readonly idleMinutes: number;
  /** Why the status is `unavailable`; `null` in every other status. */
  readonly unavailableReason: UnavailableReason | null;
  /** The browser's answer to the one-time durable-storage request. */
  readonly durable: DurableStorage | 'unknown';
}

export interface StoreControllerDeps {
  readonly storage: MetaStorage;
  readonly backend: StoreBackend;
  readonly lock: StoreLock;
  readonly random?: (length: number) => Uint8Array;
  readonly clock?: () => number;
  readonly kdfParams?: KdfParams;
  readonly minIterations?: number;
  readonly hiddenLockMs?: number;
  readonly idleMinutes?: number;
  /** Defaults to WebCrypto being present (a secure context). */
  readonly isSecureContext?: () => boolean;
  readonly requestDurable?: () => Promise<DurableStorage>;
  /**
   * Can this browser run the store at all? `initialize` asks first. Defaults to the real OPFS
   * probe (honouring `isSecureContext`); tests and the in-memory dev store pass `'ok'`.
   */
  readonly probe?: () => Promise<StorageAvailability>;
}

function clampIdleMinutes(minutes: number): number {
  let best: number = IDLE_MINUTE_CHOICES[0];
  for (const choice of IDLE_MINUTE_CHOICES) {
    if (Math.abs(choice - minutes) < Math.abs(best - minutes)) best = choice;
  }
  return best;
}

const randomBytes = (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length));

export class StoreController implements StoreSource {
  private readonly storage: MetaStorage;
  private readonly backend: StoreBackend;
  private readonly lockProvider: StoreLock;
  private readonly random: (length: number) => Uint8Array;
  private readonly clock: () => number;
  private readonly kdfParams: KdfParams;
  private readonly minIterations: number;
  private readonly hiddenLockMs: number;
  private readonly secure: () => boolean;
  private readonly askDurable: () => Promise<DurableStorage>;
  private readonly probe: () => Promise<StorageAvailability>;

  private status: StoreStatus = 'checking';
  private unavailableReason: UnavailableReason | null = null;
  private meta: StoreMeta | null = null;
  private db: StoreDb | null = null;
  private lockHandle: StoreLockHandle | null = null;
  private busy = false;
  private disposed = false;
  private durable: DurableStorage | 'unknown' = 'unknown';
  private durableAsked = false;

  private failures = 0;
  private blockedUntil: number | null = null;

  private idleMinutes: number;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivity: number | null = null;
  private hiddenAt: number | null = null;

  private snapshot: StoreSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly writeListeners = new Set<() => void>();
  private observed: { readonly raw: StoreDb; readonly wrapped: StoreDb } | null = null;

  constructor(deps: StoreControllerDeps) {
    this.storage = deps.storage;
    this.backend = deps.backend;
    this.lockProvider = deps.lock;
    this.random = deps.random ?? randomBytes;
    this.clock = deps.clock ?? Date.now;
    this.kdfParams = deps.kdfParams ?? DEFAULT_KDF_PARAMS;
    this.minIterations = deps.minIterations ?? KDF_MIN_ITERATIONS;
    this.hiddenLockMs = deps.hiddenLockMs ?? DEFAULT_HIDDEN_LOCK_MS;
    this.idleMinutes = clampIdleMinutes(deps.idleMinutes ?? DEFAULT_IDLE_MINUTES);
    this.secure = deps.isSecureContext ?? isSecureCryptoAvailable;
    this.askDurable = deps.requestDurable ?? (() => requestDurableStorage());
    this.probe = deps.probe ?? (() => probeStorageAvailability({ secure: this.secure }));
    // A worker that dies on its own while unlocked locks the store (typed locked failures).
    this.backend.onSessionLost?.(() => {
      if (this.status === 'unlocked') void this.lock();
    });
    this.snapshot = this.makeSnapshot();
  }

  // ── observation (useSyncExternalStore-friendly) ──────────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): StoreSnapshot => this.snapshot;

  get isUnlocked(): boolean {
    return this.status === 'unlocked';
  }

  /** Idle time after which an unlocked store locks itself, in milliseconds. */
  get idleTimeoutMs(): number {
    return this.idleMinutes * 60_000;
  }

  /**
   * The open database (or `null` while locked), wrapped so that every write that lands tells the
   * `onWrite` listeners (`write-observer.ts`). The same wrapper is handed out for as long as the
   * same database stays open.
   */
  database(): StoreDb | null {
    const db = this.db;
    if (db === null) return null;
    if (this.observed?.raw !== db) {
      this.observed = { raw: db, wrapped: observeWrites(db, () => this.emitWrite()) };
    }
    return this.observed.wrapped;
  }

  /** Called after each write to the store that landed (not for reads, and not for device-only settings). */
  onWrite(listener: () => void): () => void {
    this.writeListeners.add(listener);
    return () => {
      this.writeListeners.delete(listener);
    };
  }

  private emitWrite(): void {
    for (const listener of [...this.writeListeners]) listener();
  }

  private makeSnapshot(): StoreSnapshot {
    return Object.freeze({
      status: this.status,
      idleMinutes: this.idleMinutes,
      unavailableReason: this.unavailableReason,
      durable: this.durable,
    });
  }

  private notify(): void {
    if (this.disposed) return;
    this.snapshot = this.makeSnapshot();
    for (const listener of [...this.listeners]) listener();
  }

  // ── lifecycle ────────────────────────────────────────────────────────────────────────────────

  /**
   * Read the persisted header and settle the status. Safe to call again (e.g. after an erase or a
   * retry): it re-derives everything from storage. It runs the availability probe itself first.
   */
  async initialize(): Promise<void> {
    await this.teardown();
    if (this.status === 'unavailable') {
      // A retry: show the checking state again rather than the stale reason.
      this.status = 'checking';
      this.unavailableReason = null;
      this.notify();
    }
    const availability = await this.safeProbe();
    if (availability !== 'ok') {
      this.settleUnavailable(availability);
      return;
    }
    let read: StoreMetaRead;
    try {
      const minutes = Number.parseInt(this.storage.read(LOCK_IDLE_MINUTES_KEY) ?? '', 10);
      if (Number.isFinite(minutes) && minutes > 0) this.idleMinutes = clampIdleMinutes(minutes);
      read = parseStoreMeta(this.storage.read(STORE_META_KEY), this.minIterations);
    } catch {
      // Storage refused a read. Not a first run (the create flow must never run over data it
      // cannot see) and not a lost store either: the data is untouched, so only "try again".
      this.settleUnavailable('storageRefused');
      return;
    }
    if (read.kind === 'absent') {
      try {
        read = await this.recoverMissingHeader();
      } catch (error) {
        this.settleUnavailable(error instanceof StoreUnavailableError ? error.reason : 'transient');
        return;
      }
    }
    this.unavailableReason = null;
    switch (read.kind) {
      case 'absent':
        this.meta = null;
        this.status = 'needsPassphraseCreation';
        break;
      case 'present':
        this.meta = read.meta;
        this.status = 'locked';
        break;
      case 'invalid':
        this.meta = null;
        this.status = 'needsReset';
        break;
    }
    this.notify();
  }

  /** The probe must never throw: anything unexpected is a browser that cannot run the store. */
  private async safeProbe(): Promise<StorageAvailability> {
    try {
      return await this.probe();
    } catch {
      return 'noOpfs';
    }
  }

  private settleUnavailable(reason: UnavailableReason): void {
    this.meta = null;
    this.status = 'unavailable';
    this.unavailableReason = reason;
    this.notify();
  }

  /**
   * Leave `unavailable`: look at the storage again. A no-op in any other status (a retry must
   * never disturb an unlocked store).
   */
  async retry(): Promise<void> {
    if (this.status !== 'unavailable') return;
    await this.initialize();
  }

  /**
   * No header in localStorage: recover it from the copy kept beside the data; and if data exists
   * with no header at all, refuse to treat it as a first run (that would wipe a store the user may
   * still be able to recover). A storage failure along the way throws `StoreUnavailableError`
   * (retryable); it is never reported as "no header" or as lost data.
   */
  private async recoverMissingHeader(): Promise<StoreMetaRead> {
    let copy: string | null;
    try {
      copy = await this.backend.readHeaderCopy();
    } catch {
      throw new StoreUnavailableError('storageRefused');
    }
    if (copy !== null) {
      const parsed = parseStoreMeta(copy, this.minIterations);
      if (parsed.kind === 'present') {
        try {
          this.storage.write(STORE_META_KEY, encodeStoreMeta(parsed.meta));
        } catch {
          throw new StoreUnavailableError('storageRefused');
        }
      }
      return parsed;
    }
    let exists: boolean;
    try {
      exists = await this.backend.exists();
    } catch (error) {
      throw error instanceof StoreUnavailableError ? error : new StoreUnavailableError('transient');
    }
    return exists ? { kind: 'invalid' } : { kind: 'absent' };
  }

  /**
   * First-run flow: validate, mint a random per-store salt, derive, create the keyed database, and
   * only then persist the header.
   */
  async createStore(passphrase: string): Promise<UnlockOutcome> {
    if (this.status === 'unavailable') return this.unavailableOutcome();
    if (this.status !== 'needsPassphraseCreation') {
      return { kind: 'storeUnavailable', reason: 'storage' };
    }
    const issue = validateNewPassphrase(passphrase);
    if (issue !== null) return { kind: 'passphraseRejected', issue };
    if (this.busy) return { kind: 'throttled', retryAfterMs: 0 };
    if (!this.secure()) return { kind: 'storeUnavailable', reason: 'insecureContext' };
    this.busy = true;
    const bytes = passphraseBytes(passphrase);
    try {
      // Exclusive across tabs BEFORE anything is read or written.
      const handle = await this.lockProvider.tryAcquire();
      if (!handle) return { kind: 'inUseElsewhere' };
      this.lockHandle = handle;
      // Another tab may have created the store since this one started: re-read the real state
      // under the lock; never create over it.
      if (!(await this.freshStateIsEmpty())) {
        this.releaseLock();
        await this.initialize();
        return { kind: 'storeUnavailable', reason: 'storage' };
      }
      const meta = createStoreMeta(this.kdfParams, this.random(STORE_SALT_BYTES));
      try {
        this.db = await this.backend.open({
          passphrase: bytes,
          salt: meta.salt,
          kdf: meta.kdf,
          expectExisting: false,
        });
        // Copy first, then the authoritative header: if the second write fails the copy lets the
        // next start recover; if the first fails we never claim a store exists.
        await this.backend.writeHeaderCopy(encodeStoreMeta(meta));
        this.storage.write(STORE_META_KEY, encodeStoreMeta(meta));
      } catch (error) {
        await this.discardDb();
        // We hold the lock and verified nothing existed, so whatever the failed attempt left
        // behind is ours.
        try {
          await this.backend.erase();
        } catch {
          // best effort
        }
        this.releaseLock();
        return this.unavailableFrom(error);
      }
      this.meta = meta;
      return this.completeUnlock();
    } finally {
      wipe(bytes);
      this.busy = false;
    }
  }

  /** True when neither a header (storage or copy) nor database bytes exist: a real first run. */
  private async freshStateIsEmpty(): Promise<boolean> {
    try {
      if (parseStoreMeta(this.storage.read(STORE_META_KEY), this.minIterations).kind !== 'absent') {
        return false;
      }
      if ((await this.backend.readHeaderCopy()) !== null) return false;
      return !(await this.backend.exists());
    } catch {
      return false;
    }
  }

  /** Returning-user flow. */
  async unlock(passphrase: string): Promise<UnlockOutcome> {
    const meta = this.meta;
    if (this.status === 'unavailable') return this.unavailableOutcome();
    if (this.status !== 'locked' || !meta) return { kind: 'storeUnavailable', reason: 'storage' };
    const now = this.clock();
    if (this.blockedUntil !== null && now < this.blockedUntil) {
      return { kind: 'throttled', retryAfterMs: this.blockedUntil - now };
    }
    if (this.busy) return { kind: 'throttled', retryAfterMs: 0 };
    if (!this.secure()) return { kind: 'storeUnavailable', reason: 'insecureContext' };
    this.busy = true;
    const bytes = passphraseBytes(passphrase);
    try {
      // No store has an empty passphrase (validateNewPassphrase), and some WebCrypto builds
      // (WebKitGTK) refuse empty PBKDF2 key material: it is a wrong passphrase, never a failure.
      if (bytes.length === 0) return this.wrongPassphrase();
      const handle = await this.lockProvider.tryAcquire();
      if (!handle) return { kind: 'inUseElsewhere' };
      this.lockHandle = handle;
      try {
        this.db = await this.backend.open({
          passphrase: bytes,
          salt: meta.salt,
          kdf: meta.kdf,
          expectExisting: true,
        });
      } catch (error) {
        await this.discardDb();
        this.releaseLock();
        const failure = classifyOpenError(error);
        switch (failure.kind) {
          case 'wrongKey':
            return this.wrongPassphrase();
          case 'dataMissing':
            this.status = 'needsReset';
            this.notify();
            return { kind: 'dataMissing' };
          case 'unavailable':
            return { kind: 'storeUnavailable', reason: failure.reason };
          case 'newerVersion':
            return { kind: 'newerVersion' };
        }
      }
      return this.completeUnlock();
    } finally {
      wipe(bytes);
      this.busy = false;
    }
  }

  private wrongPassphrase(): UnlockOutcome {
    this.failures++;
    const delay = unlockDelayMs(this.failures);
    this.blockedUntil = delay === 0 ? null : this.clock() + delay;
    return { kind: 'wrongPassphrase', retryAfterMs: delay };
  }

  private unavailableOutcome(): UnlockOutcome {
    return { kind: 'storeUnavailable', reason: this.unavailableReason ?? 'storage' };
  }

  private unavailableFrom(error: unknown): UnlockOutcome {
    const failure = classifyOpenError(error);
    return {
      kind: 'storeUnavailable',
      reason: failure.kind === 'unavailable' ? failure.reason : 'storage',
    };
  }

  private completeUnlock(): UnlockOutcome {
    this.failures = 0;
    this.blockedUntil = null;
    this.status = 'unlocked';
    this.lastActivity = this.clock();
    this.armIdleTimer();
    this.notify();
    void this.askDurableOnce();
    return { kind: 'unlocked' };
  }

  private async askDurableOnce(): Promise<void> {
    if (this.durableAsked) return;
    this.durableAsked = true;
    this.durable = await this.askDurable();
    this.notify();
  }

  /**
   * Drop the database handle, flip to locked, THEN await the close (so the UI is already off the
   * data by the time it completes).
   */
  lock(): Promise<void> {
    return this.close('locked');
  }

  /** Same as `lock` but parks the status at `erasing` so the app does not treat it as a lock. */
  prepareForErase(): Promise<void> {
    return this.close('erasing');
  }

  private async close(next: 'locked' | 'erasing'): Promise<void> {
    this.clearTimers();
    this.hiddenAt = null;
    const db = this.db;
    this.db = null;
    const wasUnlocked = this.status === 'unlocked';
    if (next === 'erasing' ? this.status !== 'erasing' : wasUnlocked) {
      this.status = next;
      this.notify();
    }
    if (db) {
      try {
        await db.close();
      } catch {
        // The handle is already dropped; nothing to do.
      }
    }
    // Only after the database is closed may another tab take over.
    this.releaseLock();
  }

  private releaseLock(): void {
    this.lockHandle?.release();
    this.lockHandle = null;
  }

  /**
   * Delete the persisted store (database bytes first, then the header, so a half-finished erase
   * never leaves data that looks recoverable). The caller (the eraser) then calls `initialize`
   * to return to first run; on failure the status is re-derived from what is still in storage and
   * the error is rethrown for the eraser to report.
   */
  async eraseStore(): Promise<void> {
    await this.prepareForErase();
    let handle: StoreLockHandle | null = null;
    try {
      // Never delete a store another tab has open.
      handle = await this.lockProvider.tryAcquire();
      if (!handle) throw new Error('store is open in another tab');
      await this.backend.erase();
      this.storage.remove(STORE_META_KEY);
      this.storage.remove(LOCK_IDLE_MINUTES_KEY);
    } catch (error) {
      handle?.release();
      await this.initialize();
      throw error;
    }
    handle.release();
    this.meta = null;
    this.failures = 0;
    this.blockedUntil = null;
  }

  // ── auto-lock ────────────────────────────────────────────────────────────────────────────────

  /** Record user activity (pointer / keyboard); pushes the idle deadline out. At most once a second. */
  touch(): void {
    if (!this.isUnlocked) return;
    const now = this.clock();
    if (this.lastActivity !== null && now - this.lastActivity < 1000) return;
    this.lastActivity = now;
    this.armIdleTimer();
  }

  /** The page became hidden (tab switch, minimise, `visibilitychange`). */
  onHidden(): void {
    if (!this.isUnlocked) return;
    this.hiddenAt ??= this.clock();
    // A timer, not only the check on return: a tab hidden for hours must lock while hidden.
    // (Browsers may throttle it; the on-return check in `onVisible` is the fallback.)
    if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
    this.hiddenTimer = setTimeout(() => void this.lock(), this.hiddenLockMs);
  }

  /** The page is visible again: lock if it was away too long, or the idle deadline passed meanwhile. */
  onVisible(): void {
    const hiddenAt = this.hiddenAt;
    this.hiddenAt = null;
    if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
    this.hiddenTimer = null;
    if (!this.isUnlocked) return;
    const now = this.clock();
    const away = hiddenAt !== null && now - hiddenAt >= this.hiddenLockMs;
    const idle = this.lastActivity !== null && now - this.lastActivity >= this.idleTimeoutMs;
    if (away || idle) void this.lock();
  }

  /** Change the idle auto-lock delay (clamped to the offered choices) and persist it. */
  setIdleMinutes(minutes: number): void {
    if (!(minutes > 0)) return;
    this.idleMinutes = clampIdleMinutes(minutes);
    try {
      this.storage.write(LOCK_IDLE_MINUTES_KEY, String(this.idleMinutes));
    } catch {
      // A non-secret preference: applied for this session even if the browser refuses to keep it.
    }
    if (this.isUnlocked) this.armIdleTimer();
    this.notify();
  }

  private armIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.lock(), this.idleTimeoutMs);
  }

  private clearTimers(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
    this.idleTimer = null;
    this.hiddenTimer = null;
  }

  // ── internals ────────────────────────────────────────────────────────────────────────────────

  /** Failure path: close a half-open database. */
  private async discardDb(): Promise<void> {
    const db = this.db;
    this.db = null;
    if (db) {
      try {
        await db.close();
      } catch {
        // ignore
      }
    }
  }

  private async teardown(): Promise<void> {
    this.clearTimers();
    await this.discardDb();
    this.releaseLock();
  }

  /**
   * Same order as `lock`: the worker is closed FIRST and the tab lock is released only after the
   * close settled, so another tab can never open files this tab's worker still holds.
   */
  dispose(): void {
    this.disposed = true;
    this.writeListeners.clear();
    this.clearTimers();
    const db = this.db;
    this.db = null;
    const handle = this.lockHandle;
    this.lockHandle = null;
    if (db) {
      void db
        .close()
        .catch(() => undefined)
        .finally(() => handle?.release());
    } else {
      handle?.release();
    }
    this.listeners.clear();
  }

  toString(): string {
    return `StoreController(${this.status})`;
  }
}
