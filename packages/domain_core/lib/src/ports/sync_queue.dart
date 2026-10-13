// The `SyncQueue` port — the durable outbox (Story 4.3 / AD-6 /
// FR-10).
//
// The port owns: `enqueue` (idempotent on `opId`), `pending` (what the
// drain loop reads), the two watch streams the chip surface subscribes to,
// `markSynced` (called after a durable remote ack), and `markFailed`
// (called after a permanent failure).
//
// The port is pure-Dart (no drift / Flutter / HTTP imports) — v1's
// implementation is `InMemorySyncQueue` in `packages/integrations`. It is
// in-memory ON PURPOSE: with no transport there is no consumer for a
// persisted outbox, which would only grow. A durable (drift table) queue
// arrives with the first real transport, behind this same port.
//
// AD-3 invariant: writes are local-first. The local commit lands
// first; the enqueue is a separate write against the same drift
// store. The UI never reflects a log before the local commit.

import '../results/sync_failure.dart';

abstract interface class SyncQueue {
  /// Enqueue an op. Idempotent on `opId`: a second enqueue for the
  /// same op returns `AlreadyEnqueued` without writing a second
  /// row. Returns `EnqueueFailed` if the durable write fails.
  Future<EnqueueResult> enqueue(SyncOp op);

  /// The ops still awaiting a durable remote ack, oldest first, at most
  /// [limit]. This is what the drain loop (`DrainSyncQueue`) reads.
  Future<List<SyncOp>> pending({int limit = 50});

  /// Watch the queue's summary state. The stream emits the current
  /// `SyncQueueState` on every commit and on every status flip
  /// (pending → synced / failed). The Day Board subscribes to
  /// derive the chip surface.
  Stream<SyncQueueState> watchState();

  /// Watch the per-plate queue view. The stream emits a snapshot
  /// of `(plateLogId, status)` pairs on every commit / status
  /// flip. The chip widget reads this to render per-plate chips
  /// without holding the whole table in memory.
  Stream<List<SyncOpStatus>> watchPerPlate();

  /// Mark the op `synced` after a durable remote ack.
  Future<MarkResult> markSynced(String opId);

  /// Mark the op `failed` after a permanent transport failure.
  /// The row stays in the queue so a future \"retry later\" hint
  /// can re-enqueue.
  Future<MarkResult> markFailed(String opId, {required String reason});
}

/// The `(plateLogId, status)` pair the chip widget reads from the
/// per-plate stream. `status` is the same string the drift column
/// stores (`pending` | `synced` | `failed`).
class SyncOpStatus {
  const SyncOpStatus({required this.plateLogId, required this.status});

  final int plateLogId;
  final SyncOpStatusValue status;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! SyncOpStatus) return false;
    return other.plateLogId == plateLogId && other.status == status;
  }

  @override
  int get hashCode => Object.hash(plateLogId, status);
}

/// The chip-state enum the UI binds to. The values are the same
/// strings the drift `status` column stores, so the chip widget can
/// pattern-match on them without a translation layer.
enum SyncOpStatusValue {
  pending,
  synced,
  failed;

  /// The string the drift `status` column stores.
  String get nameLower => name;

  /// Parses a drift-stored status string back to the enum. Returns
  /// `pending` for unknown values (the conservative default — the
  /// chip renders the calm "pending" affordance rather than a
  /// false "synced").
  static SyncOpStatusValue parse(String raw) {
    switch (raw) {
      case 'pending':
        return SyncOpStatusValue.pending;
      case 'synced':
        return SyncOpStatusValue.synced;
      case 'failed':
        return SyncOpStatusValue.failed;
      default:
        return SyncOpStatusValue.pending;
    }
  }
}
