// The `RecordSyncOp` use-case — the AD-3 single-commit enqueue
// path (Story 4.3 / AD-3 / FR-10).
//
// The use-case owns the contract: a `RecordPlate` commit first
// lands in the encrypted store; only after the local commit does
// this use-case enqueue the op. The two writes are sequential,
// never the same transaction (AD-3 invariant: one store, no second
// source, no second mutation path).
//
// The use-case is the single sanctioned call site for enqueueing
// a plate-log op. The Day Board and the capture surfaces invoke it
// after a `RecordPlateSuccess` returns; no widget invokes
// `SyncQueue.enqueue` directly (the port is reserved for the
// use-case layer).
//
// `RecordSyncOp` does not touch the transport — that's the
// `SyncAdapter.drain` call the queue makes after the local commit.
// The use-case only enqueues. The queue decides when to drain.

import '../ports/sync_queue.dart';
import '../results/sync_failure.dart';

/// Single sanctioned `SyncOp` enqueue path. Idempotent on
/// `opId`: a second call with the same op returns
/// `AlreadyEnqueued` without writing a second row.
class RecordSyncOp {
  const RecordSyncOp({required SyncQueue queue}) : _queue = queue;

  final SyncQueue _queue;

  /// Enqueue the op. The caller (the `RecordPlate` use-case or a
  /// future plate-edit surface) hands in a fully-built `SyncOp`
  /// with a stable `opId`. The use-case does not mutate the op.
  Future<EnqueueResult> call(SyncOp op) => _queue.enqueue(op);
}
