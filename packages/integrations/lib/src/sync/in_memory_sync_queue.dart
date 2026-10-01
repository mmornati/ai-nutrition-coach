// The `InMemorySyncQueue` adapter — the v1 outbox behind the `SyncQueue`
// port (Story 4.3 / AD-6 / FR-10; renamed from `DriftSyncQueue` in the
// security review F4: it never touched drift, so the name lied).
//
// It is in-memory ON PURPOSE. v1 has no sync transport, so a persisted outbox
// would only accumulate rows that nothing consumes (and a `sync_queue_table`
// would have to be carried through every schema migration for nothing). The
// durable, drift-table-backed queue arrives with the first real transport,
// behind this same port; until then ops live for the session and every one
// stays `pending` — the UI says "saved on this device", never "synced".
//
// Keyed on `(opId)` for idempotent enqueue (FR-10 / NFR5: no duplicates) and
// on `plateLogId` for the per-plate view. A change stream fans out to both
// `watchState` and `watchPerPlate` subscribers; the adapter never blocks and
// never loses an update.

import 'dart:async';

import 'package:domain_core/domain_core.dart';

class InMemorySyncQueue implements SyncQueue {
  InMemorySyncQueue();

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
  Future<List<SyncOp>> pending({int limit = 50}) async {
    final out = <SyncOp>[];
    // `_byOpId` is insertion-ordered: oldest first.
    for (final row in _byOpId.values) {
      if (row.status != SyncOpStatusValue.pending) continue;
      out.add(row.op);
      if (out.length >= limit) break;
    }
    return List<SyncOp>.unmodifiable(out);
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

  /// Snapshot the per-plate view (`pending` / `synced` / `failed`).
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
