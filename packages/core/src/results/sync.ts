export type EnqueueResult =
  | { readonly kind: 'enqueued' }
  | { readonly kind: 'alreadyEnqueued' }
  | { readonly kind: 'enqueueFailed'; readonly reason: string };

export const ENQUEUED: EnqueueResult = Object.freeze({ kind: 'enqueued' });
export const ALREADY_ENQUEUED: EnqueueResult = Object.freeze({ kind: 'alreadyEnqueued' });
export const enqueueFailed = (reason: string): EnqueueResult => ({ kind: 'enqueueFailed', reason });

export type DrainResult =
  | { readonly kind: 'drained' }
  | { readonly kind: 'drainFailedRetryable'; readonly reason: string }
  | { readonly kind: 'drainFailedPermanent'; readonly reason: string }
  /** Nothing was sent, so the row stays pending: it is neither synced nor failed. */
  | { readonly kind: 'drainSkippedNoTransport' };

export const DRAINED: DrainResult = Object.freeze({ kind: 'drained' });
export const DRAIN_SKIPPED_NO_TRANSPORT: DrainResult = Object.freeze({
  kind: 'drainSkippedNoTransport',
});
export const drainFailedRetryable = (reason: string): DrainResult => ({
  kind: 'drainFailedRetryable',
  reason,
});
export const drainFailedPermanent = (reason: string): DrainResult => ({
  kind: 'drainFailedPermanent',
  reason,
});

export type MarkResult =
  { readonly kind: 'marked' } | { readonly kind: 'markFailed'; readonly reason: string };

export const MARKED: MarkResult = Object.freeze({ kind: 'marked' });
export const markFailed = (reason: string): MarkResult => ({ kind: 'markFailed', reason });
