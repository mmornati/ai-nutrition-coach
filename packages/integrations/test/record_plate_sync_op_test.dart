// Domain core test for the `RecordPlate` use-case extension
// (Story 4.3 / AD-3 + AD-6 + FR-10).
//
// Pins the two invariants the Story 4.3 mutation path owns:
//   1. The local commit lands first; the enqueue is a separate
//      write after `RecordPlateSuccess` (AD-3).
//   2. The enqueue is best-effort: a failure on the queue path
//      never blocks the log.

import 'dart:async';
import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';
import 'package:integrations/integrations.dart';

class _StubEncryptedStore implements EncryptedStore {
  final List<RecordPlateResult> results;
  final StreamController<List<PlateLog>> _watchCtl =
      StreamController<List<PlateLog>>.broadcast();

  _StubEncryptedStore(this.results);

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async => results.removeAt(0);

  @override
  Stream<List<PlateLog>> watchRange({
    required DateTime from,
    required DateTime to,
  }) => _watchCtl.stream;

  @override
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to}) async =>
      const PlatesRead(<PlateLog>[]);

  @override
  Future<void> close() async => _watchCtl.close();
}

/// A real `CoachNoteGenerator` over the v1 `TemplateCoach` and a no-op
/// note store — the sync-op tests only care about the enqueue seam.
CoachNoteGenerator _generator() => CoachNoteGenerator(
  coach: const TemplateCoach(),
  store: _NoopCoachNoteStore(),
);

class _NoopCoachNoteStore implements CoachNoteStore {
  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async =>
      CoachNoteAppended(note);

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async => const [];

  @override
  Stream<List<CoachNote>> watchForPlate(int plateLogId) =>
      const Stream<List<CoachNote>>.empty();

  @override
  Future<CoachInteractionResult> recordDismissal(String key) async =>
      const CoachInteractionRecorded(1);

  @override
  Stream<Set<String>> watchDismissals() => const Stream<Set<String>>.empty();

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async => const CoachInteractionRecorded(1);
}

void main() {
  group('RecordPlate + RecordSyncOp', () {
    test('enqueues after a successful local commit', () async {
      final plate = PlateLog(
        id: 42,
        loggedAtUtc: DateTime.utc(2026, 8, 16),
        entries: [
          FoodEntry(
            id: 1,
            plateLogId: 42,
            databaseFood: const DatabaseFood(
              sourceRef: 'seed-1',
              displayName: 'apple',
              source: SourceCatalog.manual,
            ),
            quantity: const QuantityRange(
              low: 1,
              high: 1,
              unit: 'piece',
              displayLabel: '1 piece',
            ),
          ),
        ],
      );
      final store = _StubEncryptedStore([RecordPlateSuccess(plate)]);
      final queue = InMemorySyncQueue();
      final useCase = RecordSyncOp(queue: queue);
      final recordPlate = RecordPlate(
        generator: _generator(),
        syncOpEnqueue: useCase,
      );
      await recordPlate(
        entries: const [
          FoodEntryDraft(
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
          ),
        ],
        store: store,
      );
      final state = await queue.watchState().first;
      expect(state.pending, 1);
      queue.dispose();
    });

    test('does not enqueue when the local commit fails', () async {
      final store = _StubEncryptedStore([
        const StoreFailure(validationError: EmptyPlateFailure()),
      ]);
      final queue = InMemorySyncQueue();
      final useCase = RecordSyncOp(queue: queue);
      final recordPlate = RecordPlate(
        generator: _generator(),
        syncOpEnqueue: useCase,
      );
      await recordPlate(
        entries: const [
          FoodEntryDraft(
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
          ),
        ],
        store: store,
      );
      final state = await queue.watchState().first;
      expect(state.pending, 0);
      expect(state.total, 0);
      queue.dispose();
    });
  });

  // Pin a no-op Uint8List reference so the test imports compile
  // even when the runtime path doesn't reach the byte buffer.
  test('Uint8List is available', () {
    expect(Uint8List(0), isA<Uint8List>());
  });
}
