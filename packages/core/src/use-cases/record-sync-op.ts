import type { SyncOp } from '../entities/sync-op';
import type { SyncQueue } from '../ports/sync-queue';
import type { EnqueueResult } from '../results/sync';

export type RecordSyncOp = (op: SyncOp) => Promise<EnqueueResult>;

/** Enqueues after the local commit. Idempotent on `opId` (the queue owns that guarantee). */
export function createRecordSyncOp(queue: SyncQueue): RecordSyncOp {
  return (op) => queue.enqueue(op);
}
