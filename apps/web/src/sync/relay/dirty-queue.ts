// The outbox of the relay backup: one persisted "not yet backed up" flag, not a list of operations.
// Phase S1 kept an in-memory queue because nothing consumed it; with a relay the question is only
// "has this device changed since the relay last acknowledged it", and the snapshot is re-read at
// push time, so a flag is all that has to survive a lock, a reload or a crash. It lives in `kv`
// under a device-only key (`sync.dirty`).
//
// It speaks the `SyncQueue` port, so the existing record-plate path and the drain use-case work
// unchanged: a plate's op marks the flag, and `pending()` is one synthetic "vault" op while the
// flag is set. It claims nothing per plate: `watchPerPlate` is always empty, so the status chip
// keeps saying "on this device" until phase S3 can say more, honestly.
//
// The flag only means something while this device is connected to a vault. A write marks it; it is
// cleared only when the relay acknowledged a push that was started after the LAST write
// (`generation`), so a write that lands during a push keeps it set.

import {
  ALREADY_ENQUEUED,
  ENQUEUED,
  MARKED,
  markFailed as markFailedResult,
  syncOp,
  type EnqueueResult,
  type MarkResult,
  type StoreObserver,
  type SyncOp,
  type SyncOpStatus,
  type SyncQueue,
  type SyncQueueState,
  type Unsubscribe,
} from '@anc/core';
import type { KeyValueStore } from '../../storage/key-value-store';
import { readDirty, writeDirty } from './connection';

export interface QueueCheckpoint {
  readonly dirty: boolean;
  readonly generation: number;
}

/** The one op the queue ever holds: "the vault changed". */
export const VAULT_OP_ID = 'vault';

export class DirtyFlagSyncQueue implements SyncQueue {
  readonly #kv: KeyValueStore;
  readonly #now: () => number;
  readonly #stateObservers = new Set<StoreObserver<SyncQueueState>>();
  readonly #plateObservers = new Set<StoreObserver<readonly SyncOpStatus[]>>();
  #connected = false;
  #dirty = false;
  #generation = 0;
  #acknowledged = -1;
  #persisting: Promise<void> = Promise.resolve();
  #since = 0;

  constructor(kv: KeyValueStore, now: () => number = Date.now) {
    this.#kv = kv;
    this.#now = now;
  }

  /** Reads the stored flag (call once when the session is built). Never throws. */
  async load(connected: boolean): Promise<void> {
    this.#connected = connected;
    try {
      this.#dirty = connected && (await readDirty(this.#kv));
    } catch {
      this.#dirty = false;
    }
    this.#since = this.#now();
    this.#emit();
  }

  get dirty(): boolean {
    return this.#dirty;
  }

  /** Counts every write; an acknowledgement clears the flag only if no write came after its start. */
  get generation(): number {
    return this.#generation;
  }

  /** Connect or disconnect this device. Leaving a vault forgets the flag: there is nothing to back up to. */
  setConnected(connected: boolean, dirty = false): void {
    this.#connected = connected;
    this.#generation++;
    this.#setDirty(connected && dirty);
  }

  /** A change was made on this device. A no-op while the device is not connected. */
  markDirty(): void {
    if (!this.#connected) return;
    this.#generation++;
    this.#setDirty(true);
  }

  /** The flag and generation as they are now, to put back after a write that is not a user's. */
  checkpoint(): QueueCheckpoint {
    return { dirty: this.#dirty, generation: this.#generation };
  }

  /**
   * Puts the flag and the generation back to `checkpoint`. Applying a pulled copy is a write to the
   * store (it fires the write observer), but it is not a change this device has to send: without
   * this every pull would be followed by a push, and two idle devices would keep bumping the
   * version for each other. A real write that raced the apply is still found, because the cycle
   * then compares what the store holds with what the relay holds.
   */
  rewind(checkpoint: QueueCheckpoint): void {
    if (!this.#connected) return;
    this.#generation = checkpoint.generation;
    this.#setDirty(checkpoint.dirty);
  }

  /** The relay acknowledged a push that read the store at `generation`. */
  acknowledge(generation: number): void {
    this.#acknowledged = generation;
  }

  /** Clears the flag if the last acknowledgement covers the last write. */
  settle(): boolean {
    if (this.#acknowledged === this.#generation) this.#setDirty(false);
    return !this.#dirty;
  }

  enqueue(op: SyncOp): Promise<EnqueueResult> {
    void op;
    const already = this.#dirty;
    this.markDirty();
    return Promise.resolve(already ? ALREADY_ENQUEUED : ENQUEUED);
  }

  pending(): Promise<readonly SyncOp[]> {
    return Promise.resolve(
      this.#dirty
        ? Object.freeze([
            syncOp({
              opId: VAULT_OP_ID,
              plateLogId: 0,
              enqueuedAtUtc: this.#since,
              kind: 'plateLogUpdated',
            }),
          ])
        : Object.freeze([]),
    );
  }

  watchState(observer: StoreObserver<SyncQueueState>): Unsubscribe {
    return this.#subscribe(this.#stateObservers, observer, () => this.#state());
  }

  watchPerPlate(observer: StoreObserver<readonly SyncOpStatus[]>): Unsubscribe {
    return this.#subscribe(this.#plateObservers, observer, () => Object.freeze([]));
  }

  markSynced(opId: string): Promise<MarkResult> {
    if (opId !== VAULT_OP_ID) return Promise.resolve(markFailedResult('unknown opId'));
    this.settle();
    return Promise.resolve(MARKED);
  }

  /** The reason is not kept; the flag stays set, so the next attempt sends everything again. */
  markFailed(opId: string, reason: string): Promise<MarkResult> {
    void reason;
    return Promise.resolve(opId === VAULT_OP_ID ? MARKED : markFailedResult('unknown opId'));
  }

  dispose(): void {
    this.#stateObservers.clear();
    this.#plateObservers.clear();
  }

  #setDirty(next: boolean): void {
    if (next === this.#dirty) return;
    this.#dirty = next;
    if (next) this.#since = this.#now();
    // Writes are chained so the stored flag always ends where the last call left it.
    this.#persisting = this.#persisting
      .then(() => writeDirty(this.#kv, next))
      .catch(() => undefined);
    this.#emit();
  }

  #state(): SyncQueueState {
    return Object.freeze({ pending: this.#dirty ? 1 : 0, synced: 0, failed: 0 });
  }

  #emit(): void {
    const state = this.#state();
    for (const observer of [...this.#stateObservers]) safely(() => observer.next(state));
  }

  #subscribe<T>(
    set: Set<StoreObserver<T>>,
    observer: StoreObserver<T>,
    snapshot: () => T,
  ): Unsubscribe {
    set.add(observer);
    queueMicrotask(() => {
      if (set.has(observer)) safely(() => observer.next(snapshot()));
    });
    return () => {
      set.delete(observer);
    };
  }
}

function safely(run: () => void): void {
  try {
    run();
  } catch {
    // A throwing observer must not break the queue or its other subscribers.
  }
}
