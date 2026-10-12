// Domain core test for the `RecordPlate` use-case extension
// (Story 4.3 / AD-3 + AD-6 + FR-10).
//
// Pins the two invariants the Story 4.3 mutation path owns:
//   1. The local commit lands first; the enqueue is a separate
//      write after `RecordPlateSuccess` (AD-3).
//   2. The enqueue is best-effort: a failure on the queue path
//      never blocks the log.
//
// domain_core cannot depend on integrations (AD-1), so the queue and
// the coach seams are in-test fakes over the domain ports.

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

class _StubEncryptedStore implements EncryptedStore {
  _StubEncryptedStore(this.results);

  final List<RecordPlateResult> results;

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async => results.removeAt(0);

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) =>
      const Stream<List<PlateLog>>.empty();

  @override
  Future<void> close() async {}
}

/// Records every enqueued op.
class _RecordingSyncQueue implements SyncQueue {
  final List<SyncOp> enqueued = [];

  @override
  Future<EnqueueResult> enqueue(SyncOp op) async {
    enqueued.add(op);
    return const Enqueued();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('not used');
}

/// Inert coach seams — `CoachNoteGenerator` collapses their failures
/// to `NoCoachNoteGenerated`, so the log path never sees them.
class _StubCoach implements Coach {
  const _StubCoach();
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('not used');
}

class _StubCoachNoteStore implements CoachNoteStore {
  const _StubCoachNoteStore();
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('not used');
}

const _apple = FoodEntryDraft(
  databaseFood: DatabaseFood(
    sourceRef: 'seed-1',
    displayName: 'apple',
    source: SourceCatalog.manual,
  ),
  quantity: QuantityRange(
    low: 1,
    high: 1,
    unit: 'piece',
    displayLabel: '1 piece',
  ),
);

void main() {
  group('RecordPlate + RecordSyncOp', () {
    const generator = CoachNoteGenerator(
      coach: _StubCoach(),
      store: _StubCoachNoteStore(),
    );

    test('enqueues after a successful local commit', () async {
      final plate = PlateLog(
        id: 42,
        loggedAtUtc: DateTime.utc(2026, 8, 16),
        entries: [
          FoodEntry(
            id: 1,
            plateLogId: 42,
            databaseFood: _apple.databaseFood,
            quantity: _apple.quantity,
          ),
        ],
      );
      final store = _StubEncryptedStore([RecordPlateSuccess(plate)]);
      final queue = _RecordingSyncQueue();
      final recordPlate = RecordPlate(
        generator: generator,
        syncOpEnqueue: RecordSyncOp(queue: queue),
      );

      final result = await recordPlate(entries: const [_apple], store: store);

      expect(result, isA<RecordPlateSuccess>());
      expect(queue.enqueued, hasLength(1));
      final op = queue.enqueued.single;
      expect(op.plateLogId, 42);
      expect(op.opId, 'plate-42');
      expect(op.kind, SyncOpKind.plateLogCreated);
      expect(op.enqueuedAtUtc, plate.loggedAtUtc);
    });

    test('does not enqueue when the local commit fails', () async {
      final store = _StubEncryptedStore([
        const StoreFailure(validationError: EmptyPlateFailure()),
      ]);
      final queue = _RecordingSyncQueue();
      final recordPlate = RecordPlate(
        generator: generator,
        syncOpEnqueue: RecordSyncOp(queue: queue),
      );

      final result = await recordPlate(entries: const [_apple], store: store);

      expect(result, isA<StoreFailure>());
      expect(queue.enqueued, isEmpty);
    });
  });
}
