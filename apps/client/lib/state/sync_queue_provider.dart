// Riverpod providers for the sync queue + adapter (Story 4.3 / AD-6 /
// FR-10 / OQ-1), made honest in the security review (F4).
//
// v1 has NO sync transport, so:
//   * `syncQueueProvider` is the session-only `InMemorySyncQueue` (a
//     persisted outbox with no consumer would only grow);
//   * `syncAdapterProvider` is the `LocalOnlySyncAdapter`, which sends
//     nothing and never answers "drained";
//   * `syncTransportAvailableProvider` is `false`, and the UI keys off it:
//     nothing says "synced" or "pending" — a plate is "on this device".
//     (The chip's per-op states exist for the day a transport does.)
//
// `syncDrainProvider` is the drain loop: it runs one `DrainSyncQueue` pass
// whenever the queue changes, never two at once. With no transport the pass
// returns immediately without touching the queue, so ops simply stay
// pending.

import 'dart:async';

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

/// The `SyncQueue` port's default implementation (in-memory, v1).
final Provider<SyncQueue> syncQueueProvider = Provider<SyncQueue>((ref) {
  final queue = InMemorySyncQueue();
  ref.onDispose(queue.dispose);
  return queue;
});

/// The `SyncAdapter` port's default implementation: no transport
/// (FR-10 / AD-6: no third-party transport in v1).
final Provider<SyncAdapter> syncAdapterProvider = Provider<SyncAdapter>((ref) {
  return const LocalOnlySyncAdapter();
});

/// `true` only when the adapter can really send ops. While `false`, no
/// surface may talk about syncing.
final Provider<bool> syncTransportAvailableProvider = Provider<bool>(
  (ref) => ref.watch(syncAdapterProvider).hasTransport,
);

/// The drain loop (see the file header). Watch it once at the app root; it
/// is a no-op without a transport.
final Provider<DrainSyncQueue> drainSyncQueueProvider =
    Provider<DrainSyncQueue>(
      (ref) => DrainSyncQueue(
        queue: ref.watch(syncQueueProvider),
        adapter: ref.watch(syncAdapterProvider),
      ),
    );

/// Starts the drain loop for the lifetime of the provider scope.
final Provider<void> syncDrainProvider = Provider<void>((ref) {
  final drain = ref.watch(drainSyncQueueProvider);
  final queue = ref.watch(syncQueueProvider);
  var running = false;
  var again = false;
  Future<void> pass() async {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        final summary = await drain();
        // Nothing to send over, or the transport asked to wait: stop; the
        // next queue change starts a new pass.
        if (summary.noTransport || summary.deferred > 0) break;
      } while (again);
    } on Object {
      // The use-case collapses failures; this is belt and braces.
    } finally {
      running = false;
    }
  }

  final sub = queue.watchState().listen((state) {
    if (state.pending > 0) unawaited(pass());
  });
  ref.onDispose(sub.cancel);
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
final Provider<RecordSyncOp> recordSyncOpProvider = Provider<RecordSyncOp>((
  ref,
) {
  return RecordSyncOp(queue: ref.watch(syncQueueProvider));
});
