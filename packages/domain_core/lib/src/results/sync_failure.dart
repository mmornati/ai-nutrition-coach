// Typed results the sync queue + adapter cross (Story 4.3 / AD-6
// / FR-10 / conventions).
//
// Two sealed hierarchies live here:
//
//   * `EnqueueResult` — what `SyncQueue.enqueue` returns. The
//     `AlreadyEnqueued` variant honours the idempotent enqueue
//     invariant: the durable outbox keys on `(opId)` and a duplicate
//     enqueue is a typed no-op.
//
//   * `DrainResult` — what `SyncAdapter.drain` returns. The two
//     failure variants split retryable from permanent so the
//     outbox can move a row to `failed` after a permanent failure
//     without retrying forever.
//
// No raw exceptions cross either port (conventions).

export '../entities/sync_op.dart' show SyncOp, SyncOpKind;
export '../entities/sync_queue_state.dart';

/// The `SyncQueueState` snapshot a `Stream<SyncQueueState>` emits.
/// Re-exported here for ergonomic import paths.
export '../entities/sync_queue_state.dart';

/// The `SyncOp` is re-exported here for ergonomic import paths.
export '../entities/sync_op.dart' show SyncOp, SyncOpKind;

/// The outcome of `SyncQueue.enqueue(SyncOp)`.
sealed class EnqueueResult {
  const EnqueueResult();
}

/// The op was enqueued. The row lives in the queue with status
/// `pending`.
final class Enqueued extends EnqueueResult {
  const Enqueued();
}

/// The op was already in the queue with the same `opId`. The
/// `SyncQueue` keys on `opId` so a retry produces a typed no-op.
/// Honours FR-10 / NFR5 (no duplicates).
final class AlreadyEnqueued extends EnqueueResult {
  const AlreadyEnqueued();
}

/// The enqueue failed. The op is not in the queue; the caller may
/// retry. The reason is opaque to the caller — adapters wrap drift
/// errors at the boundary.
final class EnqueueFailed extends EnqueueResult {
  const EnqueueFailed(this.reason);
  final String reason;
}

/// The outcome of `SyncAdapter.drain(SyncOp)`.
sealed class DrainResult {
  const DrainResult();
}

/// The transport acknowledged the op durably (the data reached the
/// remote). The outbox moves the row to `synced`. Never returned by an
/// adapter that sent nothing.
final class Drained extends DrainResult {
  const Drained();
}

/// The transport returned a retryable failure (network blip,
/// 5xx, etc.). The outbox keeps the row in `pending` and retries
/// later.
final class DrainFailedRetryable extends DrainResult {
  const DrainFailedRetryable(this.reason);
  final String reason;
}

/// The transport returned a permanent failure (4xx other than 408 /
/// 429, schema mismatch, etc.). The outbox moves the row to
/// `failed`; the chip surface surfaces a calm "retry later" hint.
final class DrainFailedPermanent extends DrainResult {
  const DrainFailedPermanent(this.reason);
  final String reason;
}

/// There is no transport to send the op over (v1: `LocalOnlySyncAdapter`).
/// Nothing was sent, so the row stays `pending` — it is neither synced nor
/// failed — and the drain loop stops without touching the queue.
final class DrainSkippedNoTransport extends DrainResult {
  const DrainSkippedNoTransport();
}

/// The reason `SyncQueue.markFailed` / `markSynced` returns when
/// the row was not in the queue. A retry produces the same
/// idempotent no-op the enqueue path uses.
sealed class MarkResult {
  const MarkResult();
}

final class Marked extends MarkResult {
  const Marked();
}

final class MarkFailed extends MarkResult {
  const MarkFailed(this.reason);
  final String reason;
}
