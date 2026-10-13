import type { SyncOp } from '../entities/sync-op';
import type { DrainResult } from '../results/sync';

export interface SyncAdapter {
  readonly hasTransport: boolean;
  drain(op: SyncOp): Promise<DrainResult>;
}
