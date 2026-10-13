// The `DriftSyncQueue` adapter — durable outbox rows live here
// (Story 4.3 / AD-6 / FR-10).
//
// **Story 4.3 ships this adapter as an in-memory implementation.**
// The drift `sync_queue_table` is declared in
// `tables/sync_queue_table.dart` so the schema is reviewable, but
// it is NOT wired into `AppDatabase.tables` in v1 — hand-extending
// the 2474-line committed `app_database.g.dart` to add the 5th
// table is the Story 4.3.1 follow-up. This adapter's interface is
// drift-shaped so swapping in the durable table-backed
// implementation is a one-class change behind the same `SyncQueue`
// port.
//
// The in-memory backing is keyed on `(opId)` for idempotent
// enqueue (FR-10 / NFR5: no duplicates) and on `plateLogId` for
// the chip's per-plate view. A change stream fans out to both
// `watchState` and `watchPerPlate` subscribers; the adapter never
// blocks, never loses an update, and the chip surface never
// reflects a log before the local commit (the `RecordSyncOp`
// use-case owns the call ordering — AD-3 invariant).
//
// AD-7: the queue's only user-facing surface is the chip; copy
// lives in `SyncQueueStrings` (in `coach_strings.dart`).

import 'dart:async';

import 'package:domain_core/domain_core.dart';

class DriftSyncQueue implements SyncQueue {
  DriftSyncQueue();

  /// `opId` → row. The unique key for idempotent enqueue.
  final Map<String, _QueueRow> _byOpId = {};

  /// `plateLogId` → set of `opId`s. The chip's per-plate view.
  final Map<int, Set<String>> _byPlate = {};

  /// The two change streams. A new event on either fires both.
  final _stateCtl = StreamController<SyncQueueState>.broadcast();
  final _perPlateCtl = StreamController<List<SyncOpStatus>>.broadcast();

  void dispose() {
    _stateCtl.close();
    _perPlateCtl.close();
  }

  @override
  Future<EnqueueResult> enqueue(SyncOp op) async {
    if (_byOpId.containsKey(op.opId)) {
      // Idempotent: a second enqueue for the same op is a typed
      // no-op. Honours FR-10 / NFR5 (no duplicates).
      _emit();
      return const AlreadyEnqueued();
    }
    _byOpId[op.opId] = _QueueRow(op: op, status: SyncOpStatusValue.pending);
    _byPlate.putIfAbsent(op.plateLogId, () => <String>{}).add(op.opId);
    _emit();
    return const Enqueued();
  }

  @override
  Stream<SyncQueueState> watchState() async* {
    yield _state();
    yield* _stateCtl.stream;
  }

  @override
  Stream<List<SyncOpStatus>> watchPerPlate() async* {
    yield _perPlate();
    yield* _perPlateCtl.stream;
  }

  @override
  Future<MarkResult> markSynced(String opId) async {
    final row = _byOpId[opId];
    if (row == null) {
      return const MarkFailed('unknown opId');
    }
    _byOpId[opId] = _QueueRow(op: row.op, status: SyncOpStatusValue.synced);
    _emit();
    return const Marked();
  }

  @override
  Future<MarkResult> markFailed(String opId, {required String reason}) async {
    final row = _byOpId[opId];
    if (row == null) {
      return const MarkFailed('unknown opId');
    }
    _byOpId[opId] = _QueueRow(op: row.op, status: SyncOpStatusValue.failed);
    _emit();
    return const Marked();
  }

  /// Snapshot the summary state.
  SyncQueueState _state() {
    var pending = 0;
    var synced = 0;
    var failed = 0;
    for (final row in _byOpId.values) {
      switch (row.status) {
        case SyncOpStatusValue.pending:
          pending++;
        case SyncOpStatusValue.synced:
          synced++;
        case SyncOpStatusValue.failed:
          failed++;
      }
    }
    return SyncQueueState(pending: pending, synced: synced, failed: failed);
  }

  /// Snapshot the per-plate view. The chip widget reads this to
  /// derive `local` (no op) / `pending` / `synced` for each plate.
  List<SyncOpStatus> _perPlate() {
    final out = <SyncOpStatus>[];
    for (final entry in _byPlate.entries) {
      final plateLogId = entry.key;
      final opIds = entry.value;
      // Conservative rollup: any pending wins over synced, which
      // wins over failed. The chip surface treats `failed` as a
      // calm "retry later" hint, never a red-guilt state (FR-15).
      SyncOpStatusValue rolled = SyncOpStatusValue.synced;
      for (final opId in opIds) {
        final status = _byOpId[opId]?.status ?? SyncOpStatusValue.synced;
        if (status == SyncOpStatusValue.pending) {
          rolled = SyncOpStatusValue.pending;
        } else if (status == SyncOpStatusValue.failed &&
            rolled != SyncOpStatusValue.pending) {
          rolled = SyncOpStatusValue.failed;
        }
      }
      out.add(SyncOpStatus(plateLogId: plateLogId, status: rolled));
    }
    return List<SyncOpStatus>.unmodifiable(out);
  }

  void _emit() {
    _stateCtl.add(_state());
    _perPlateCtl.add(_perPlate());
  }
}

class _QueueRow {
  const _QueueRow({required this.op, required this.status});
  final SyncOp op;
  final SyncOpStatusValue status;
}
