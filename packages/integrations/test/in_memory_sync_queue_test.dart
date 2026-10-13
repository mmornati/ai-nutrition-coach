// Sync queue + adapter test (Story 4.3 / AD-6 / FR-10).
//
// Pins the four invariants the durable outbox + transport own:
//   1. `enqueue` is idempotent on `opId` (FR-10 / NFR5).
//   2. `watchState` emits on every commit / status flip.
//   3. `watchPerPlate` derives the per-plate chip from queue state
//      (AD-3 invariant: chip never holds a UI counter).
//   4. The `LocalOnlySyncAdapter` has no transport: it NEVER reports
//      `Drained` (nothing was sent — security review F4), the drain loop
//      leaves ops pending, and a fake transport drives the real loop.

import 'package:domain_core/domain_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';

void main() {
  group('InMemorySyncQueue', () {
    late InMemorySyncQueue queue;
    setUp(() {
      queue = InMemorySyncQueue();
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

  group('LocalOnlySyncAdapter (F4)', () {
    SyncOp op() => SyncOp(
      opId: 'op-1',
      plateLogId: 1,
      enqueuedAtUtc: DateTime.utc(2026, 8, 16),
      kind: SyncOpKind.plateLogCreated,
    );

    test('has no transport and never claims to have drained', () async {
      const adapter = LocalOnlySyncAdapter();
      expect(adapter.hasTransport, isFalse);
      expect(await adapter.drain(op()), isA<DrainSkippedNoTransport>());
    });

    test(
      'the drain loop leaves every op pending — nothing is "synced"',
      () async {
        final queue = InMemorySyncQueue();
        await queue.enqueue(op());
        final summary = await DrainSyncQueue(
          queue: queue,
          adapter: const LocalOnlySyncAdapter(),
        )();
        expect(summary.noTransport, isTrue);
        final state = await queue.watchState().first;
        expect(state.pending, 1);
        expect(state.synced, 0);
        queue.dispose();
      },
    );

    test('with a real transport the loop marks synced and failed', () async {
      final queue = InMemorySyncQueue();
      for (final id in ['a', 'b']) {
        await queue.enqueue(
          SyncOp(
            opId: id,
            plateLogId: id.codeUnitAt(0),
            enqueuedAtUtc: DateTime.utc(2026, 8, 16),
            kind: SyncOpKind.plateLogCreated,
          ),
        );
      }
      final summary = await DrainSyncQueue(
        queue: queue,
        adapter: _Transport([const Drained(), const DrainFailedPermanent('x')]),
      )();
      expect(summary.drained, 1);
      expect(summary.failed, 1);
      final state = await queue.watchState().first;
      expect((state.pending, state.synced, state.failed), (0, 1, 1));
      expect(await queue.pending(), isEmpty);
      queue.dispose();
    });

    test('pending() lists only pending ops, oldest first, bounded', () async {
      final queue = InMemorySyncQueue();
      for (var i = 0; i < 5; i++) {
        await queue.enqueue(
          SyncOp(
            opId: 'op$i',
            plateLogId: i,
            enqueuedAtUtc: DateTime.utc(2026, 8, 16),
            kind: SyncOpKind.plateLogCreated,
          ),
        );
      }
      await queue.markSynced('op0');
      final two = await queue.pending(limit: 2);
      expect(two.map((o) => o.opId), ['op1', 'op2']);
      queue.dispose();
    });
  });

  group('RecordSyncOp use-case', () {
    test('enqueues via the injected queue', () async {
      final queue = InMemorySyncQueue();
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

class _Transport implements SyncAdapter {
  _Transport(this._results);

  final List<DrainResult> _results;
  var _i = 0;

  @override
  bool get hasTransport => true;

  @override
  Future<DrainResult> drain(SyncOp op) async => _results[_i++];
}
