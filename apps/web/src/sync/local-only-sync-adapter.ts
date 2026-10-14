import { DRAIN_SKIPPED_NO_TRANSPORT, type SyncAdapter } from '@anc/core';

/**
 * The v1 transport: there is none. It opens no socket and sends nothing, so it never reports
 * `drained` (that would tell the queue, and through it the UI, that data reached a remote when
 * it never left the device). `drain` answers `drainSkippedNoTransport`, leaving the op pending.
 */
export const localOnlySyncAdapter: SyncAdapter = Object.freeze({
  hasTransport: false,
  drain: () => Promise.resolve(DRAIN_SKIPPED_NO_TRANSPORT),
});
