import type { Unsubscribe } from '../common';
import type { SyncOp } from '../entities/sync-op';
import type { SyncOpStatusValue, SyncQueueState } from '../entities/sync-queue-state';
import type { EnqueueResult, MarkResult } from '../results/sync';
import type { StoreObserver } from './observer';

/** The rolled-up status of one plate's ops. */
export interface SyncOpStatus {
  readonly plateLogId: number;
  readonly status: SyncOpStatusValue;
}

export interface SyncQueue {
  /** Idempotent on `opId`. */
  enqueue(op: SyncOp): Promise<EnqueueResult>;
  pending(options?: { readonly limit?: number }): Promise<readonly SyncOp[]>;
  /** Same observer contract as `EncryptedStore.watchRange` (see `StoreObserver`). */
  watchState(observer: StoreObserver<SyncQueueState>): Unsubscribe;
  /** One entry per plate that has ops; plates with none are absent ("on this device"). */
  watchPerPlate(observer: StoreObserver<readonly SyncOpStatus[]>): Unsubscribe;
  markSynced(opId: string): Promise<MarkResult>;
  markFailed(opId: string, reason: string): Promise<MarkResult>;
}
