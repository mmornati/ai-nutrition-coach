// `CoachNoteGenerator` use-case contract — locks the AD-3 / AD-5 /
// FR4 / NFR3 promise that every `RecordPlate` commit fires one
// post-resolve coach note (or `NoCoachNoteGenerated` for an
// unmatched pattern / coach-empty path).
//
// AD-1: the structural grep test in `domain_core_test.dart` pins the
// purity invariant; this behavioural test pins the dispatch
// contract on top of that.
//
// Coverage of the I/O & Edge-Case Matrix in the spec:
//   * HAPPY_PATH_POST_RESOLVE  — covered by `balanced plate resolves
//     to balanced + note appended`.
//   * NO_PATTERN_MATCH          — covered by `only-other-entries
//     returns NoCoachNoteGenerated(unknownPattern)`.
//   * COACH_PORT_UNAVAILABLE    — covered by `coach port throwing
//     returns NoCoachNoteGenerated(coachEmpty)`.
//   * STORE_WRITE_FAILURE       — covered by `store failure
//     collapses to NoCoachNoteGenerated(appendFailed)`.
//   * AI_OFF_ACTIVE             — covered by the FakeCoach path
//     (the production wiring uses TemplateCoach; both produce the
//     same `CoachFound` / `NoCoachQuestion` shape — AD-5).

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

class _FakeCoach implements Coach {
  _FakeCoach();

  final List<({CoachAnchor anchor, CompositionPattern pattern})> calls =
      <({CoachAnchor anchor, CompositionPattern pattern})>[];
  CoachQuestionResult _next = const NoCoachQuestion();
  bool throwOnNextCall = false;

  void emit(CoachQuestionResult result) {
    _next = result;
  }

  @override
  CoachQuestionResult questionFor({
    required CoachAnchor anchor,
    required CompositionPattern pattern,
  }) {
    calls.add((anchor: anchor, pattern: pattern));
    if (throwOnNextCall) {
      throwOnNextCall = false;
      throw StateError('simulated coach port failure');
    }
    final next = _next;
    _next = const NoCoachQuestion();
    return next;
  }
}

class _FakeCoachNoteStore implements CoachNoteStore {
  @override
  Future<DeletePlateResult> deleteForPlate(int plateLogId) async =>
      const PlateDeleted();

  _FakeCoachNoteStore();

  final Set<String> dismissed = <String>{};

  @override
  Stream<List<CoachNote>> watchForPlate(int plateLogId) async* {
    yield await forPlate(plateLogId);
  }

  @override
  Future<CoachInteractionResult> recordDismissal(String key) async {
    dismissed.add(key);
    return const CoachInteractionRecorded(1);
  }

  @override
  Stream<Set<String>> watchDismissals() async* {
    yield Set<String>.of(dismissed);
  }

  final List<CoachNote> appended = [];
  final Map<int, List<CoachNote>> byPlate = {};
  CoachNoteAppendResult? _nextAppendResult;
  int _nextId = 1;
  int _nextInteractionId = 1;

  /// Force the next `append` to succeed (returning `CoachNoteAppended`
  /// with an autoincrement id) — the default is to fail so the
  /// best-effort path is exercised.
  void succeed() {
    _nextAppendResult = null;
  }

  void forceFailure() {
    _nextAppendResult = const CoachNoteAppendFailure(
      StoreFailure(encryptedStoreError: SecureKeyFailure()),
    );
  }

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    final forced = _nextAppendResult;
    if (forced != null) {
      _nextAppendResult = null;
      return forced;
    }
    final assigned = note.copyWith(id: _nextId++);
    appended.add(assigned);
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
    return CoachInteractionRecorded(_nextInteractionId++);
  }
}

PlateLog _plateWith({
  required int id,
  required List<({FoodGroup group, String name})> entries,
  DateTime? loggedAtUtc,
}) {
  return PlateLog(
    id: id,
    loggedAtUtc: loggedAtUtc ?? DateTime.utc(2026, 8, 16, 12),
    entries: [
      for (var i = 0; i < entries.length; i++)
        FoodEntry(
          id: i + 1,
          plateLogId: id,
          databaseFood: DatabaseFood(
            sourceRef: 'manual:${entries[i].name}',
            displayName: entries[i].name,
            source: SourceCatalog.manual,
            foodGroup: entries[i].group,
          ),
          quantity: const QuantityRange(
            low: 1,
            high: 1,
            unit: 'serving',
            displayLabel: '~1 serving',
          ),
        ),
    ],
  );
}

void main() {
  group('CoachNoteGenerator pattern pick logic', () {
    test('balanced plate (veg+protein+starch) resolves to balanced', () async {
      final coach = _FakeCoach();
      final store = _FakeCoachNoteStore()..succeed();
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
      final gen = CoachNoteGenerator(coach: coach, store: store);

      final plate = _plateWith(
        id: 7,
        entries: const [
          (group: FoodGroup.vegFruit, name: 'Salad'),
          (group: FoodGroup.protein, name: 'Chicken'),
          (group: FoodGroup.starch, name: 'Rice'),
        ],
      );

      final result = await gen.generateFor(plate);

      expect(result, isA<CoachNoteGenerated>());
      final generated = result as CoachNoteGenerated;
      expect(generated.note.plateLogId, 7);
      expect(generated.note.anchor, CoachAnchor.postResolve);
      expect(generated.note.questionKey, 'post.resolve.balanced');
      expect(generated.note.text, isNotEmpty);
      expect(coach.calls, hasLength(1));
      expect(coach.calls.first.anchor, CoachAnchor.postResolve);
      expect(coach.calls.first.pattern, CompositionPattern.balanced);
      expect(store.appended, hasLength(1));
      expect(store.appended.first.plateLogId, 7);
    });

    test('veg-only plate (2 veg, no protein) resolves to vegRich', () async {
      final coach = _FakeCoach();
      final store = _FakeCoachNoteStore()..succeed();
      coach.emit(const NoCoachQuestion());
      final gen = CoachNoteGenerator(coach: coach, store: store);

      final plate = _plateWith(
        id: 1,
        entries: const [
          (group: FoodGroup.vegFruit, name: 'Salad'),
          (group: FoodGroup.vegFruit, name: 'Roasted veg'),
        ],
      );

      await gen.generateFor(plate);

      expect(coach.calls, hasLength(1));
      expect(coach.calls.first.pattern, CompositionPattern.vegRich);
    });

    test(
      'protein-heavy plate (3 protein, 1 veg) resolves to proteinHeavy',
      () async {
        final coach = _FakeCoach();
        final store = _FakeCoachNoteStore()..succeed();
        coach.emit(const NoCoachQuestion());
        final gen = CoachNoteGenerator(coach: coach, store: store);

        final plate = _plateWith(
          id: 1,
          entries: const [
            (group: FoodGroup.vegFruit, name: 'Salad'),
            (group: FoodGroup.protein, name: 'Chicken'),
            (group: FoodGroup.protein, name: 'Fish'),
            (group: FoodGroup.protein, name: 'Eggs'),
          ],
        );

        await gen.generateFor(plate);

        expect(coach.calls.first.pattern, CompositionPattern.proteinHeavy);
      },
    );

    test(
      'starch-heavy plate (3 starch, 1 veg) resolves to starchHeavy',
      () async {
        final coach = _FakeCoach();
        final store = _FakeCoachNoteStore()..succeed();
        coach.emit(const NoCoachQuestion());
        final gen = CoachNoteGenerator(coach: coach, store: store);

        final plate = _plateWith(
          id: 1,
          entries: const [
            (group: FoodGroup.vegFruit, name: 'Salad'),
            (group: FoodGroup.starch, name: 'Rice'),
            (group: FoodGroup.starch, name: 'Pasta'),
            (group: FoodGroup.starch, name: 'Bread'),
          ],
        );

        await gen.generateFor(plate);

        expect(coach.calls.first.pattern, CompositionPattern.starchHeavy);
      },
    );

    test('plate with no veg at all resolves to vegLight', () async {
      final coach = _FakeCoach();
      final store = _FakeCoachNoteStore()..succeed();
      coach.emit(const NoCoachQuestion());
      final gen = CoachNoteGenerator(coach: coach, store: store);

      final plate = _plateWith(
        id: 1,
        entries: const [
          (group: FoodGroup.protein, name: 'Chicken'),
          (group: FoodGroup.starch, name: 'Rice'),
        ],
      );

      await gen.generateFor(plate);

      expect(coach.calls.first.pattern, CompositionPattern.vegLight);
    });

    test('single veg entry (no dairy) resolves to dairyLight', () async {
      final coach = _FakeCoach();
      final store = _FakeCoachNoteStore()..succeed();
      coach.emit(const NoCoachQuestion());
      final gen = CoachNoteGenerator(coach: coach, store: store);

      final plate = _plateWith(
        id: 1,
        entries: const [(group: FoodGroup.vegFruit, name: 'Salad')],
      );

      await gen.generateFor(plate);

      expect(coach.calls.first.pattern, CompositionPattern.dairyLight);
    });

    test(
      'only-other-entries returns NoCoachNoteGenerated(unknownPattern)',
      () async {
        final coach = _FakeCoach();
        final store = _FakeCoachNoteStore()..succeed();
        final gen = CoachNoteGenerator(coach: coach, store: store);

        final plate = _plateWith(
          id: 1,
          entries: const [
            (group: FoodGroup.other, name: 'Olive oil'),
            (group: FoodGroup.other, name: 'Salt'),
          ],
        );

        final result = await gen.generateFor(plate);

        expect(result, isA<NoCoachNoteGenerated>());
        expect((result as NoCoachNoteGenerated).reason, 'unknownPattern');
        expect(coach.calls, isEmpty);
        expect(store.appended, isEmpty);
      },
    );

    test('empty plate returns NoCoachNoteGenerated(emptyPlate) and does '
        'not consult the coach or store', () async {
      final coach = _FakeCoach();
      final store = _FakeCoachNoteStore()..succeed();
      final gen = CoachNoteGenerator(coach: coach, store: store);

      final plate = PlateLog(
        id: 1,
        loggedAtUtc: DateTime.utc(2026, 8, 16),
        entries: const [],
      );

      final result = await gen.generateFor(plate);

      expect(result, isA<NoCoachNoteGenerated>());
      expect((result as NoCoachNoteGenerated).reason, 'emptyPlate');
      expect(coach.calls, isEmpty);
      expect(store.appended, isEmpty);
    });

    test('coach port returning NoCoachQuestion collapses to '
        'NoCoachNoteGenerated(coachEmpty) — no note written', () async {
      final coach = _FakeCoach();
      final store = _FakeCoachNoteStore()..succeed();
      final gen = CoachNoteGenerator(coach: coach, store: store);

      final plate = _plateWith(
        id: 1,
        entries: const [
          (group: FoodGroup.vegFruit, name: 'Salad'),
          (group: FoodGroup.protein, name: 'Chicken'),
        ],
      );

      final result = await gen.generateFor(plate);

      expect(result, isA<NoCoachNoteGenerated>());
      expect((result as NoCoachNoteGenerated).reason, 'coachEmpty');
      expect(store.appended, isEmpty);
    });

    test(
      'coach port throwing collapses to NoCoachNoteGenerated(coachEmpty)',
      () async {
        final coach = _FakeCoach()..throwOnNextCall = true;
        final store = _FakeCoachNoteStore()..succeed();
        final gen = CoachNoteGenerator(coach: coach, store: store);

        final plate = _plateWith(
          id: 1,
          entries: const [(group: FoodGroup.vegFruit, name: 'Salad')],
        );

        final result = await gen.generateFor(plate);

        expect(result, isA<NoCoachNoteGenerated>());
        expect((result as NoCoachNoteGenerated).reason, 'coachEmpty');
        expect(store.appended, isEmpty);
      },
    );

    test(
      'store write failure collapses to NoCoachNoteGenerated(appendFailed)',
      () async {
        final coach = _FakeCoach();
        coach.emit(
          CoachFound(
            const CoachQuestion(
              key: 'post.resolve.balanced',
              text: 'Nice plate.',
              anchor: CoachAnchor.postResolve,
              pattern: CompositionPattern.balanced,
            ),
          ),
        );
        final store = _FakeCoachNoteStore()..forceFailure();
        final gen = CoachNoteGenerator(coach: coach, store: store);

        final plate = _plateWith(
          id: 1,
          entries: const [
            (group: FoodGroup.vegFruit, name: 'Salad'),
            (group: FoodGroup.protein, name: 'Chicken'),
          ],
        );

        final result = await gen.generateFor(plate);

        expect(result, isA<NoCoachNoteGenerated>());
        expect((result as NoCoachNoteGenerated).reason, 'appendFailed');
        expect(
          store.appended,
          isEmpty,
          reason: 'failed append must not record a note',
        );
      },
    );
  });

  group('CoachNote value type (FR9)', () {
    test('round-trips every required field', () {
      final note = CoachNote(
        id: 1,
        plateLogId: 7,
        anchor: CoachAnchor.postResolve,
        questionKey: 'post.resolve.balanced',
        text: 'Nice plate.',
        generatedAt: DateTime.utc(2026, 8, 16, 12),
      );
      expect(note.id, 1);
      expect(note.plateLogId, 7);
      expect(note.anchor, CoachAnchor.postResolve);
      expect(note.questionKey, 'post.resolve.balanced');
      expect(note.text, 'Nice plate.');
      expect(note.generatedAt, DateTime.utc(2026, 8, 16, 12));
    });

    test('equality is by id; same id compares equal regardless of text', () {
      final a = CoachNote(
        id: 1,
        plateLogId: 7,
        anchor: CoachAnchor.postResolve,
        questionKey: 'a',
        text: 'first',
        generatedAt: DateTime.utc(2026, 8, 16),
      );
      final b = CoachNote(
        id: 1,
        plateLogId: 7,
        anchor: CoachAnchor.openPlate,
        questionKey: 'b',
        text: 'second',
        generatedAt: DateTime.utc(2026, 8, 17),
      );
      expect(a, b);
      expect(a.hashCode, b.hashCode);
    });

    test('different ids compare not equal', () {
      final a = CoachNote(
        id: 1,
        plateLogId: 7,
        anchor: CoachAnchor.postResolve,
        questionKey: 'a',
        text: 'x',
        generatedAt: DateTime.utc(2026, 8, 16),
      );
      final b = a.copyWith(id: 2);
      expect(a, isNot(b));
    });

    test('copyWith returns a new instance with overridden fields', () {
      final base = CoachNote(
        id: 1,
        plateLogId: 7,
        anchor: CoachAnchor.postResolve,
        questionKey: 'a',
        text: 'original',
        generatedAt: DateTime.utc(2026, 8, 16),
      );
      final updated = base.copyWith(text: 'revised', plateLogId: 9);
      expect(updated.text, 'revised');
      expect(updated.plateLogId, 9);
      expect(updated.id, 1);
    });
  });

  group('CoachNoteAppendResult sealed hierarchy', () {
    test('CoachNoteAppended carries the assigned note', () {
      final noteWithDate = CoachNote(
        id: 1,
        plateLogId: 7,
        anchor: CoachAnchor.postResolve,
        questionKey: 'k',
        text: 't',
        generatedAt: DateTime.utc(2026, 8, 16),
      );
      final result = CoachNoteAppended(noteWithDate);
      expect(result.note, noteWithDate);
      expect(result, isA<CoachNoteAppendResult>());
    });

    test('CoachNoteAppendFailure carries a StoreFailure cause', () {
      final cause = const StoreFailure(encryptedStoreError: SecureKeyFailure());
      final result = CoachNoteAppendFailure(cause);
      expect(result.cause, cause);
      expect(result, isA<CoachNoteAppendResult>());
    });
  });

  group('CoachNoteGenerationResult sealed hierarchy', () {
    test('CoachNoteGenerated default reason is "matched"', () {
      final note = CoachNote(
        id: 1,
        plateLogId: 7,
        anchor: CoachAnchor.postResolve,
        questionKey: 'k',
        text: 't',
        generatedAt: DateTime.utc(2026, 8, 16),
      );
      final result = CoachNoteGenerated(note);
      expect(result.reason, 'matched');
      expect(result.note, note);
      expect(result, isA<CoachNoteGenerationResult>());
    });

    test('NoCoachNoteGenerated carries the reason', () {
      const result = NoCoachNoteGenerated('coachEmpty');
      expect(result.reason, 'coachEmpty');
      expect(result, isA<CoachNoteGenerationResult>());
    });
  });
}
