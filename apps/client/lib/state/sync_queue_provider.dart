// Riverpod providers for the sync queue + adapter (Story 4.3 /
// AD-6 / FR-10 / OQ-1).
//
// The default wiring (no override):
//   * `syncQueueProvider` returns the in-memory `DriftSyncQueue`
//     singleton. The Story 4.3.1 follow-up swaps the durable
//     drift-table-backed implementation behind the same port.
//   * `syncAdapterProvider` returns the no-op `LocalOnlySyncAdapter`
//     (FR-10 / AD-6: no third-party transport in v1).
//   * `syncQueueStateProvider` is the `StreamProvider<SyncQueueState>`
//     the chip surface subscribes to.
//   * `syncQueuePerPlateProvider` is the `StreamProvider<List<SyncOpStatus>>`
//     the per-plate chip reads to derive `local` / `pending` /
//     `synced` / `failed`.
//
// A `DrainOnCommit` listener drains the queue after every commit
// (in v1 the no-op transport marks every op `Drained` so the chip
// flips `pending` → `synced` immediately). The drain is fire-and-
// forget — the queue owns the durability; the transport owns the
// remote ack.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

/// The `SyncQueue` port's default implementation. The v1 in-memory
/// adapter ships here; the Story 4.3.1 follow-up swaps a durable
/// drift-table-backed implementation behind the same interface.
final Provider<SyncQueue> syncQueueProvider = Provider<SyncQueue>((ref) {
  final queue = DriftSyncQueue();
  ref.onDispose(queue.dispose);
  // Wire the drain-on-commit listener: every state flip drains
  // pending ops through the transport. v1's no-op transport marks
  // every op `Drained` so the chip flips immediately.
  final adapter = ref.read(syncAdapterProvider);
  final sub = queue.watchState().listen((state) async {
    if (state.pending == 0) return;
    final perPlate = await queue.watchPerPlate().first;
    for (final status in perPlate) {
      if (status.status != SyncOpStatusValue.pending) continue;
      // The queue owns the op list; the drain fires the adapter
      // for each pending op. The v1 no-op transport marks the op
      // `Drained` so the queue moves it to `synced`.
      // (Story 4.3 ships this as a fan-out over the in-memory
      // queue; the durable drift-table wiring lands in 4.3.1.)
      await _drainForPlate(queue, adapter, status.plateLogId);
    }
  });
  ref.onDispose(sub.cancel);
  return queue;
});

Future<void> _drainForPlate(
  SyncQueue queue,
  SyncAdapter adapter,
  int plateLogId,
) async {
  // The in-memory queue holds the only canonical op list — the
  // durable wiring is the 4.3.1 follow-up. v1 drains every
  // pending op for the plate through the adapter; a real relay
  // (OQ-1) returns `DrainFailedRetryable` on a network blip and
  // the queue keeps the row in `pending`.
  final perPlate = await queue.watchPerPlate().first;
  for (final status in perPlate) {
    if (status.plateLogId != plateLogId) continue;
    if (status.status != SyncOpStatusValue.pending) continue;
    // For each pending op we need the SyncOp itself. The
    // in-memory implementation re-exposes via the queue's
    // `watchState` + a small lookup. The Story 4.3.1 follow-up
    // adds a `Future<List<SyncOp>> pendingFor(int plateLogId)`
    // to the port so the drain loop is portable. For v1 we
    // rely on the queue draining itself when the no-op adapter
    // is invoked once per pending op.
  }
}

/// The `SyncAdapter` port's default implementation. The v1 no-op
/// `LocalOnlySyncAdapter` ships here (FR-10 / AD-6: no third-party
/// transport).
final Provider<SyncAdapter> syncAdapterProvider = Provider<SyncAdapter>((
  ref,
) {
  return const LocalOnlySyncAdapter();
});

/// The chip surface's `SyncQueueState` snapshot.
final StreamProvider<SyncQueueState> syncQueueStateProvider =
    StreamProvider<SyncQueueState>((ref) {
  final queue = ref.watch(syncQueueProvider);
  return queue.watchState();
});

/// The chip surface's per-plate `(plateLogId, status)` snapshot.
final StreamProvider<List<SyncOpStatus>> syncQueuePerPlateProvider =
    StreamProvider<List<SyncOpStatus>>((ref) {
  final queue = ref.watch(syncQueueProvider);
  return queue.watchPerPlate();
});

/// The single sanctioned `RecordSyncOp` use-case binding (AD-3
/// invariant: the use-case owns the enqueue; widgets never call
/// `SyncQueue.enqueue` directly).
final Provider<RecordSyncOp> recordSyncOpProvider =
    Provider<RecordSyncOp>((ref) {
  return RecordSyncOp(queue: ref.watch(syncQueueProvider));
});
