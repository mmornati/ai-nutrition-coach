// `coachNotesForPlateProvider` + `coachNoteGeneratorProvider` tests
// (Story 2.2 / AD-3).
//
// Pins:
//   * `coachNoteStoreProvider` must be overridden at the ProviderScope
//     root; the seam throws `UnimplementedError` otherwise;
//   * `coachNoteGeneratorProvider` wires `coachProvider` and the
//     `coachNoteStoreProvider` so the `RecordPlate` use-case can
//     invoke `generateFor(plate)`;
//   * `coachNotesForPlateProvider(plateId)` returns the notes
//     anchored to the given plate; empty list for a plate with no
//     notes (legacy-data path).

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/state/coach_note_provider.dart';
import 'package:ai_nutrition_coach/state/coach_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';

class _FakeEncryptedStore implements EncryptedStore {
  int recordCalls = 0;

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
    recordCalls++;
    final id = recordCalls;
    final committed = <FoodEntry>[
      for (var i = 0; i < entries.length; i++)
        FoodEntry(
          id: id * 1000 + i + 1,
          plateLogId: id,
          databaseFood: entries[i].databaseFood,
          quantity: entries[i].quantity,
        ),
    ];
    return RecordPlateSuccess(
      PlateLog(
        id: id,
        loggedAtUtc: loggedAtUtc ?? DateTime.utc(2026, 8, 16),
        entries: committed,
      ),
    );
  }

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) =>
      const Stream<List<PlateLog>>.empty();

  @override
  Future<void> close() async {}
}

class _FakeCoachNoteStore implements CoachNoteStore {
  _FakeCoachNoteStore();

  final Map<int, List<CoachNote>> byPlate = {};
  final List<CoachInteractionLog> interactions = [];
  int _nextId = 1;
  int _nextInteractionId = 1;

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    final assigned = note.copyWith(id: _nextId++);
    byPlate.putIfAbsent(assigned.plateLogId, () => []).add(assigned);
    return CoachNoteAppended(assigned);
  }

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async {
    return List<CoachNote>.unmodifiable(byPlate[plateLogId] ?? const []);
  }

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async {
    interactions.add(log);
    return CoachInteractionRecorded(_nextInteractionId++);
  }
}

ProviderContainer _container({
  Coach? coach,
  CoachNoteStore? coachNotes,
  EncryptedStore? store,
}) {
  final container = ProviderContainer(
    overrides: [
      encryptedStoreProvider.overrideWithValue(store ?? _FakeEncryptedStore()),
      if (coach != null) coachProvider.overrideWithValue(coach),
      if (coachNotes != null)
        coachNoteStoreProvider.overrideWithValue(coachNotes),
    ],
  );
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('coachNoteStoreProvider', () {
    test('throws UnimplementedError when not overridden (defensive seam)', () {
      final container = ProviderContainer(
        overrides: [
          encryptedStoreProvider.overrideWithValue(_FakeEncryptedStore()),
          coachProvider.overrideWithValue(FakeCoach()),
        ],
      );
      addTearDown(container.dispose);

      Object? thrown;
      try {
        container.read(coachNoteStoreProvider);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, isNotNull);
      expect(
        thrown.toString(),
        contains('coachNoteStoreProvider must be overridden'),
      );
    });
  });

  group('coachNoteGeneratorProvider', () {
    test('constructs a CoachNoteGenerator wired from coach + store', () {
      final coach = FakeCoach();
      final store = _FakeCoachNoteStore();
      final container = _container(coach: coach, coachNotes: store);

      final generator = container.read(coachNoteGeneratorProvider);
      expect(generator, isA<CoachNoteGenerator>());
    });

    test('RecordPlate use-case reads the generator from the provider', () {
      final coach = FakeCoach();
      final store = _FakeCoachNoteStore();
      final container = _container(coach: coach, coachNotes: store);

      final useCase = container.read(recordPlateProvider);
      expect(useCase, isA<RecordPlate>());
    });
  });

  group('coachNotesForPlateProvider', () {
    test(
      'returns empty list when the store has no notes for the plate',
      () async {
        final store = _FakeCoachNoteStore();
        final container = _container(coach: FakeCoach(), coachNotes: store);

        final notes = await container.read(
          coachNotesForPlateProvider(404).future,
        );
        expect(notes, isEmpty);
      },
    );

    test('returns notes the store holds for the plate', () async {
      final store = _FakeCoachNoteStore();
      // Pre-seed: one note for plate 7, one for plate 9.
      final a = await store.append(
        CoachNote(
          id: 0,
          plateLogId: 7,
          anchor: CoachAnchor.postResolve,
          questionKey: 'post.resolve.vegLight',
          text: 'A handful of greens would round this plate out.',
          generatedAt: DateTime.utc(2026, 8, 16),
        ),
      );
      expect(a, isA<CoachNoteAppended>());
      final b = await store.append(
        CoachNote(
          id: 0,
          plateLogId: 9,
          anchor: CoachAnchor.postResolve,
          questionKey: 'post.resolve.proteinHeavy',
          text: 'A small bowl of greens or roasted veg would lighten this up.',
          generatedAt: DateTime.utc(2026, 8, 16),
        ),
      );
      expect(b, isA<CoachNoteAppended>());

      final container = _container(coach: FakeCoach(), coachNotes: store);

      final notes7 = await container.read(coachNotesForPlateProvider(7).future);
      expect(notes7, hasLength(1));
      expect(notes7.first.questionKey, 'post.resolve.vegLight');

      final notes9 = await container.read(coachNotesForPlateProvider(9).future);
      expect(notes9, hasLength(1));
      expect(notes9.first.questionKey, 'post.resolve.proteinHeavy');

      final notesEmpty = await container.read(
        coachNotesForPlateProvider(404).future,
      );
      expect(notesEmpty, isEmpty);
    });

    test(
      'different plate ids return different note lists (no cross-bleed)',
      () async {
        final store = _FakeCoachNoteStore();
        await store.append(
          CoachNote(
            id: 0,
            plateLogId: 1,
            anchor: CoachAnchor.postResolve,
            questionKey: 'a',
            text: 'plate 1',
            generatedAt: DateTime.utc(2026, 8, 16),
          ),
        );
        await store.append(
          CoachNote(
            id: 0,
            plateLogId: 2,
            anchor: CoachAnchor.postResolve,
            questionKey: 'b',
            text: 'plate 2',
            generatedAt: DateTime.utc(2026, 8, 16),
          ),
        );
        final container = _container(coach: FakeCoach(), coachNotes: store);

        final p1 = await container.read(coachNotesForPlateProvider(1).future);
        final p2 = await container.read(coachNotesForPlateProvider(2).future);
        expect(p1.single.questionKey, 'a');
        expect(p2.single.questionKey, 'b');
      },
    );
  });

  group('integration: recordPlateProvider commits and fires the generator', () {
    test(
      'a successful plate commit appends one CoachNote via the store',
      () async {
        final coach = FakeCoach();
        coach.emit(
          CoachFound(
            const CoachQuestion(
              key: 'post.resolve.balanced',
              text: 'Nice plate — anything you would change next time?',
              anchor: CoachAnchor.postResolve,
              pattern: CompositionPattern.balanced,
            ),
          ),
        );
        final store = _FakeCoachNoteStore();
        final fakeStore = _FakeEncryptedStore();
        final container = _container(
          coach: coach,
          coachNotes: store,
          store: fakeStore,
        );

        final useCase = container.read(recordPlateProvider);
        final draft = FoodEntryDraft(
          databaseFood: const DatabaseFood(
            sourceRef: 'manual:apple',
            displayName: 'Apple',
            source: SourceCatalog.manual,
            foodGroup: FoodGroup.vegFruit,
          ),
          quantity: const QuantityRange(
            low: 1,
            high: 1,
            unit: 'piece',
            displayLabel: '~1 piece',
          ),
        );
        final result = await useCase(
          entries: [draft],
          store: fakeStore,
          loggedAtUtc: DateTime.utc(2026, 8, 16),
        );
        expect(result, isA<RecordPlateSuccess>());
        final plate = (result as RecordPlateSuccess).plateLog;
        // The generator fired once and persisted one note against the
        // committed plate's id.
        final notes = await container.read(
          coachNotesForPlateProvider(plate.id).future,
        );
        expect(notes, hasLength(1));
        expect(notes.first.questionKey, 'post.resolve.balanced');
      },
    );
  });
}
