// The sync-queue summary the UI consumes to render the chip
// surface (Story 4.3 / AD-6 / FR-10).
//
// The Day Board reads this via a `StreamProvider<SyncQueueState>`
// and renders each plate's chip from `chipStateFor(plateLogId)`.
// The state is a small pure-Dart value type: counts only, no per-
// plate metadata (the per-plate chip is computed by the chip
// widget on demand from the full `SyncQueue.watch()` stream so the
// summary stays cheap).
//
// Equality is by all three counts so the stream emits a fresh value
// only when the surface actually changed.

class SyncQueueState {
  const SyncQueueState({
    required this.pending,
    required this.synced,
    required this.failed,
  });

  /// Number of ops awaiting a durable remote acknowledgment.
  final int pending;

  /// Number of ops the remote has durably acknowledged.
  final int synced;

  /// Number of ops that exhausted retries with a permanent failure.
  /// v1 carries the count for completeness; the UI surfaces a calm
  /// "retry later" hint when the count is non-zero.
  final int failed;

  /// The total number of ops the queue holds.
  int get total => pending + synced + failed;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! SyncQueueState) return false;
    return other.pending == pending &&
        other.synced == synced &&
        other.failed == failed;
  }

  @override
  int get hashCode => Object.hash(pending, synced, failed);

  @override
  String toString() =>
      'SyncQueueState(pending: $pending, synced: $synced, '
      'failed: $failed)';
}
