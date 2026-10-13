// Sync queue + adapter test (Story 4.3 / AD-6 / FR-10).
//
// Pins the four invariants the durable outbox + transport own:
//   1. `enqueue` is idempotent on `opId` (FR-10 / NFR5).
//   2. `watchState` emits on every commit / status flip.
//   3. `watchPerPlate` derives the per-plate chip from queue state
//      (AD-3 invariant: chip never holds a UI counter).
//   4. The no-op `LocalOnlySyncAdapter` returns `Drained` without
//      opening a socket (FR-12 / AD-6: no third-party transport
//      in v1).

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

void main() {
  group('DriftSyncQueue', () {
    late DriftSyncQueue queue;
    setUp(() {
      queue = DriftSyncQueue();
    });
    tearDown(() {
      queue.dispose();
    });

    test('enqueue is idempotent on opId', () async {
      final op = SyncOp(
        opId: 'plate-1',
        plateLogId: 1,
        enqueuedAtUtc: DateTime.utc(2026, 8, 16),
        kind: SyncOpKind.plateLogCreated,
      );
      expect(await queue.enqueue(op), isA<Enqueued>());
      expect(await queue.enqueue(op), isA<AlreadyEnqueued>());
      final state = await queue.watchState().first;
      expect(state.pending, 1);
      expect(state.synced, 0);
    });

    test('markSynced moves pending → synced', () async {
      final op = SyncOp(
        opId: 'plate-1',
        plateLogId: 1,
        enqueuedAtUtc: DateTime.utc(2026, 8, 16),
        kind: SyncOpKind.plateLogCreated,
      );
      await queue.enqueue(op);
      expect(await queue.markSynced(op.opId), isA<Marked>());
      final state = await queue.watchState().first;
      expect(state.pending, 0);
      expect(state.synced, 1);
    });

    test('watchPerPlate rolls up per-plate status', () async {
      await queue.enqueue(
        SyncOp(
          opId: 'plate-1',
          plateLogId: 1,
          enqueuedAtUtc: DateTime.utc(2026, 8, 16),
          kind: SyncOpKind.plateLogCreated,
        ),
      );
      await queue.enqueue(
        SyncOp(
          opId: 'plate-2',
          plateLogId: 2,
          enqueuedAtUtc: DateTime.utc(2026, 8, 16),
          kind: SyncOpKind.plateLogCreated,
        ),
      );
      await queue.markSynced('plate-2');
      final perPlate = await queue.watchPerPlate().first;
      expect(perPlate, hasLength(2));
      final p1 = perPlate.firstWhere((e) => e.plateLogId == 1);
      final p2 = perPlate.firstWhere((e) => e.plateLogId == 2);
      expect(p1.status, SyncOpStatusValue.pending);
      expect(p2.status, SyncOpStatusValue.synced);
    });
  });

  group('LocalOnlySyncAdapter', () {
    test('returns Drained without opening a socket', () async {
      const adapter = LocalOnlySyncAdapter();
      final result = await adapter.drain(
        SyncOp(
          opId: 'plate-1',
          plateLogId: 1,
          enqueuedAtUtc: DateTime.utc(2026, 8, 16),
          kind: SyncOpKind.plateLogCreated,
        ),
      );
      expect(result, isA<Drained>());
    });
  });

  group('RecordSyncOp use-case', () {
    test('enqueues via the injected queue', () async {
      final queue = DriftSyncQueue();
      final useCase = RecordSyncOp(queue: queue);
      final result = await useCase(
        SyncOp(
          opId: 'plate-1',
          plateLogId: 1,
          enqueuedAtUtc: DateTime.utc(2026, 8, 16),
          kind: SyncOpKind.plateLogCreated,
        ),
      );
      expect(result, isA<Enqueued>());
      queue.dispose();
    });
  });
}
