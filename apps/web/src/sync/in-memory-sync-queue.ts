import {
  ALREADY_ENQUEUED,
  ENQUEUED,
  MARKED,
  markFailed as markFailedResult,
  rollupPlateStatus,
  type EnqueueResult,
  type MarkResult,
  type StoreObserver,
  type SyncOp,
  type SyncOpStatus,
  type SyncOpStatusValue,
  type SyncQueue,
  type SyncQueueState,
  type Unsubscribe,
} from '@anc/core';

interface Row {
  readonly op: SyncOp;
  status: SyncOpStatusValue;
}

/**
 * The v1 outbox behind the `SyncQueue` port. In memory ON PURPOSE: v1 has no sync transport, so
 * a persisted outbox would only accumulate rows nothing consumes. Ops live for the session and
 * every one stays `pending`; the UI says "on this device", never "synced". Idempotent on `opId`;
 * `plateLogId` keys the per-plate view. Observers get the current value once, asynchronously
 * after subscribe, then on every change; snapshots are frozen.
 */
export class InMemorySyncQueue implements SyncQueue {
  private readonly byOpId = new Map<string, Row>();
  private readonly byPlate = new Map<number, Set<string>>();
  private readonly stateObservers = new Set<Subscription<SyncQueueState>>();
  private readonly plateObservers = new Set<Subscription<readonly SyncOpStatus[]>>();

  enqueue(op: SyncOp): Promise<EnqueueResult> {
    if (this.byOpId.has(op.opId)) {
      this.emit();
      return Promise.resolve(ALREADY_ENQUEUED);
    }
    this.byOpId.set(op.opId, { op, status: 'pending' });
    let ids = this.byPlate.get(op.plateLogId);
    if (ids === undefined) {
      ids = new Set();
      this.byPlate.set(op.plateLogId, ids);
    }
    ids.add(op.opId);
    this.emit();
    return Promise.resolve(ENQUEUED);
  }

  /** Oldest first. */
  pending(options?: { readonly limit?: number }): Promise<readonly SyncOp[]> {
    const limit = options?.limit ?? 50;
    const out: SyncOp[] = [];
    for (const row of this.byOpId.values()) {
      if (row.status !== 'pending') continue;
      out.push(row.op);
      if (out.length >= limit) break;
    }
    return Promise.resolve(Object.freeze(out));
  }

  watchState(observer: StoreObserver<SyncQueueState>): Unsubscribe {
    return this.subscribe(this.stateObservers, observer, () => this.state());
  }

  watchPerPlate(observer: StoreObserver<readonly SyncOpStatus[]>): Unsubscribe {
    return this.subscribe(this.plateObservers, observer, () => this.perPlate());
  }

  markSynced(opId: string): Promise<MarkResult> {
    return this.mark(opId, 'synced');
  }

  /** The reason is accepted for the port but never kept: it is not shown anywhere in v1. */
  markFailed(opId: string, reason: string): Promise<MarkResult> {
    void reason;
    return this.mark(opId, 'failed');
  }

  /** Stops every subscription. */
  dispose(): void {
    this.stateObservers.clear();
    this.plateObservers.clear();
  }

  private mark(opId: string, status: SyncOpStatusValue): Promise<MarkResult> {
    const row = this.byOpId.get(opId);
    if (row === undefined) return Promise.resolve(markFailedResult('unknown opId'));
    row.status = status;
    this.emit();
    return Promise.resolve(MARKED);
  }

  private state(): SyncQueueState {
    let pending = 0;
    let synced = 0;
    let failed = 0;
    for (const row of this.byOpId.values()) {
      if (row.status === 'pending') pending++;
      else if (row.status === 'synced') synced++;
      else failed++;
    }
    return Object.freeze({ pending, synced, failed });
  }

  private perPlate(): readonly SyncOpStatus[] {
    const out: SyncOpStatus[] = [];
    for (const [plateLogId, opIds] of this.byPlate) {
      const statuses: SyncOpStatusValue[] = [];
      for (const opId of opIds) {
        const row = this.byOpId.get(opId);
        if (row !== undefined) statuses.push(row.status);
      }
      const status = rollupPlateStatus(statuses);
      if (status !== null) out.push(Object.freeze({ plateLogId, status }));
    }
    return Object.freeze(out);
  }

  private emit(): void {
    deliver(this.stateObservers, this.state());
    deliver(this.plateObservers, this.perPlate());
  }

  private subscribe<T>(
    set: Set<Subscription<T>>,
    observer: StoreObserver<T>,
    snapshot: () => T,
  ): Unsubscribe {
    const subscription: Subscription<T> = { observer, started: false };
    set.add(subscription);
    queueMicrotask(() => {
      if (!set.has(subscription)) return;
      subscription.started = true;
      safely(() => observer.next(snapshot()));
    });
    return () => {
      set.delete(subscription);
    };
  }
}

interface Subscription<T> {
  readonly observer: StoreObserver<T>;
  /** Changes before the first (asynchronous) emission are covered by it. */
  started: boolean;
}

function deliver<T>(set: ReadonlySet<Subscription<T>>, value: T): void {
  for (const subscription of [...set]) {
    if (subscription.started) safely(() => subscription.observer.next(value));
  }
}

function safely(run: () => void): void {
  try {
    run();
  } catch {
    // A throwing observer must not break the queue or its other subscribers.
  }
}
