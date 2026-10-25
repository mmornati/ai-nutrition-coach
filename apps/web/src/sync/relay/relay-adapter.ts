// The `SyncAdapter` of the relay backup: the transport behind the port (AD-6). `drain` runs one
// pull-merge-push round (`runSyncCycle`) and answers `drained` ONLY when the relay has acknowledged
// the data (or there was nothing to send); anything else is a typed failure and the flag stays set.
// With no connection there is no transport and nothing is claimed.

import {
  DRAINED,
  drainFailedPermanent,
  drainFailedRetryable,
  DRAIN_SKIPPED_NO_TRANSPORT,
  type DrainResult,
  type SyncAdapter,
  type SyncOp,
} from '@anc/core';
import type { CycleResult } from './cycle';

export interface RelaySyncAdapter extends SyncAdapter {
  /** What the last `drain` found, for the caller that needs more than the port's answer. */
  readonly lastCycle: CycleResult | null;
}

export function createRelaySyncAdapter(deps: {
  readonly connected: () => boolean;
  readonly run: () => Promise<CycleResult>;
}): RelaySyncAdapter {
  let last: CycleResult | null = null;
  return {
    get hasTransport() {
      return deps.connected();
    },
    get lastCycle() {
      return last;
    },
    async drain(op: SyncOp): Promise<DrainResult> {
      void op;
      if (!deps.connected()) return DRAIN_SKIPPED_NO_TRANSPORT;
      let result: CycleResult;
      try {
        result = await deps.run();
      } catch {
        result = { kind: 'retry', reason: 'unavailable' };
      }
      last = result;
      switch (result.kind) {
        case 'upToDate':
        case 'pushed':
          return DRAINED;
        case 'retry':
          return drainFailedRetryable(result.reason);
        case 'locked':
          return drainFailedRetryable('locked');
        case 'stopped':
          return drainFailedPermanent(result.reason);
      }
    },
  };
}
