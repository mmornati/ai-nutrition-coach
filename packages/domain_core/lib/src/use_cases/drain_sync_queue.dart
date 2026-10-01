// The `DrainSyncQueue` use-case — one pass of the outbox drain loop
// (security review F4 / AD-6 / FR-10).
//
// Reads the pending ops from the `SyncQueue`, hands each to the
// `SyncAdapter` in order, and records the outcome:
//
//   * `Drained`                — the remote acknowledged: `markSynced`.
//   * `DrainFailedPermanent`   — `markFailed`; the loop continues.
//   * `DrainFailedRetryable`   — the row stays `pending`; the pass stops
//                                (order is preserved, the next pass retries).
//   * `DrainSkippedNoTransport`— nothing was sent; nothing is marked and
//                                the pass stops.
//
// With an adapter that has no transport the queue is not even read: data
// that was never sent is never reported as synced. No exception crosses
// the use-case — an adapter that throws counts as a retryable failure.

import '../ports/sync_adapter.dart';
import '../ports/sync_queue.dart';
import '../results/sync_failure.dart';

/// What one drain pass did.
final class DrainSummary {
  const DrainSummary({
    this.drained = 0,
    this.failed = 0,
    this.deferred = 0,
    this.noTransport = false,
  });

  /// Ops the remote acknowledged (now `synced`).
  final int drained;

  /// Ops that failed permanently (now `failed`).
  final int failed;

  /// Ops left `pending` after a retryable failure.
  final int deferred;

  /// `true` when the adapter has no transport: nothing was attempted.
  final bool noTransport;
}

class DrainSyncQueue {
  const DrainSyncQueue({required SyncQueue queue, required SyncAdapter adapter})
    : _queue = queue,
      _adapter = adapter;

  final SyncQueue _queue;
  final SyncAdapter _adapter;

  Future<DrainSummary> call({int limit = 50}) async {
    if (!_adapter.hasTransport) return const DrainSummary(noTransport: true);
    var drained = 0;
    var failed = 0;
    var deferred = 0;
    final ops = await _queue.pending(limit: limit);
    for (final op in ops) {
      DrainResult result;
      try {
        result = await _adapter.drain(op);
      } on Object {
        result = const DrainFailedRetryable('adapter threw');
      }
      switch (result) {
        case Drained():
          await _queue.markSynced(op.opId);
          drained++;
        case DrainFailedPermanent(:final reason):
          await _queue.markFailed(op.opId, reason: reason);
          failed++;
        case DrainFailedRetryable():
          deferred = ops.length - drained - failed;
          return DrainSummary(
            drained: drained,
            failed: failed,
            deferred: deferred,
          );
        case DrainSkippedNoTransport():
          return DrainSummary(
            drained: drained,
            failed: failed,
            deferred: ops.length - drained - failed,
            noTransport: true,
          );
      }
    }
    return DrainSummary(drained: drained, failed: failed, deferred: deferred);
  }
}
