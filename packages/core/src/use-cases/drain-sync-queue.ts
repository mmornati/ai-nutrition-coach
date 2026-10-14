import type { SyncAdapter } from '../ports/sync-adapter';
import type { SyncQueue } from '../ports/sync-queue';
import { drainFailedRetryable, type DrainResult, type MarkResult } from '../results/sync';

export interface DrainSummary {
  readonly drained: number;
  readonly failed: number;
  readonly deferred: number;
  readonly noTransport: boolean;
}

export type DrainSyncQueue = (options?: { readonly limit?: number }) => Promise<DrainSummary>;

async function mark(run: () => Promise<MarkResult>): Promise<boolean> {
  try {
    return (await run()).kind === 'marked';
  } catch {
    return false;
  }
}

/**
 * `drained` marks synced; a permanent failure marks failed and continues; a retryable failure
 * stops the pass and keeps the rest pending; no transport marks nothing (never claims "synced").
 */
export function createDrainSyncQueue(deps: {
  readonly queue: SyncQueue;
  readonly adapter: SyncAdapter;
}): DrainSyncQueue {
  return async (options) => {
    if (!deps.adapter.hasTransport) {
      return { drained: 0, failed: 0, deferred: 0, noTransport: true };
    }
    let drained = 0;
    let failed = 0;
    const ops = await deps.queue.pending({ limit: options?.limit ?? 50 });
    for (const op of ops) {
      let result: DrainResult;
      try {
        result = await deps.adapter.drain(op);
      } catch {
        result = drainFailedRetryable('adapter threw');
      }
      const stop = (noTransport: boolean): DrainSummary => ({
        drained,
        failed,
        deferred: ops.length - drained - failed,
        noTransport,
      });
      switch (result.kind) {
        case 'drained':
          // Count only what was really recorded: a failed mark leaves the row pending, so the
          // pass stops (the store is unhealthy) and the adapter re-sends it next time.
          if (!(await mark(() => deps.queue.markSynced(op.opId)))) return stop(false);
          drained++;
          break;
        case 'drainFailedPermanent': {
          const { reason } = result;
          if (!(await mark(() => deps.queue.markFailed(op.opId, reason)))) return stop(false);
          failed++;
          break;
        }
        case 'drainFailedRetryable':
          return stop(false);
        case 'drainSkippedNoTransport':
          return stop(true);
        default: {
          const _exhaustive: never = result;
          return _exhaustive;
        }
      }
    }
    return { drained, failed, deferred: 0, noTransport: false };
  };
}
