// `RecordCoachInteraction` use-case contract — locks the FR5 /
// AD-3 / AD-5 / NFR3 promise that:
//   * `[sure]` writes the interaction AND appends exactly ONE
//     bounded depth follow-up `CoachNote` with
//     `anchor: depthFollowUp`. Second tap is idempotent.
//   * `[ask later]` and `[dismiss]` write the interaction only;
//     no follow-up note, no nag.
//   * `[close]` on the depth panel writes the
//     `depthAnswer` interaction; no follow-up note.
//   * store-write failures collapse to a typed
//     `CoachInteractionResult` — never a thrown exception.
//   * coach port throwing for `depthFollowUp` collapses to no
//     follow-up (calm degrade).
//
// AD-1: the structural grep test in `domain_core_test.dart` pins the
// purity invariant; this behavioural test pins the dispatch
// contract on top of that.
//
// Coverage of the I/O & Edge-Case Matrix in the spec:
//   * HAPPY_PATH_SURE            — covered by `[sure] writes +
//     appends exactly one bounded depth follow-up`.
//   * HAPPY_PATH_ASK_LATER        — covered by `[ask later] writes
//     the interaction only`.
//   * HAPPY_PATH_DISMISS          — covered by `[dismiss] writes
//     the interaction only`.
//   * HAPPY_PATH_DEPTH_CLOSE      — covered by `[depthAnswer]
//     writes the interaction only`.
//   * DEPTH_FOLLOWUP_ALREADY_VIEWED — covered by `second [sure] tap
//     is idempotent (no extra notes)`.
//   * DEPTH_PORT_UNAVAILABLE       — covered by `coach port throwing
//     for depthFollowUp collapses to no follow-up`.
//   * STORE_WRITE_FAILURE          — covered by `recordInteraction
//     store failure collapses to typed CoachInteractionFailed`.
//   * AI_OFF_ACTIVE                — covered by every happy-path
//     test (the production wiring uses TemplateCoach; both produce
//     the same `CoachFound` / `NoCoachQuestion` shape — AD-5).
//   * NO_OPEN_PLATE_QUESTION       — n/a: depth follow-up is a
//     post-resolve-only surface; the matrix case is covered by
//     `OpenPlateHint` widget tests in apps/client.

import 'package:domain_core/domain_core.dart';
import 'package:test/test.dart';

class _FakeCoach implements Coach {
  _FakeCoach();

  final List<({CoachAnchor anchor, CompositionPattern pattern})> calls =
      <({CoachAnchor anchor, CompositionPattern pattern})>[];
  final List<CoachInteractionLog> interactions = [];
  CoachQuestionResult _next = const NoCoachQuestion();
  CoachQuestionResult _depthNext = const NoCoachQuestion();
  bool throwOnDepthCall = false;

  void emit(CoachQuestionResult result) {
    _next = result;
  }

  void emitDepth(CoachQuestionResult result) {
    _depthNext = result;
  }

  @override
  CoachQuestionResult questionFor({
    required CoachAnchor anchor,
    required CompositionPattern pattern,
  }) {
    calls.add((anchor: anchor, pattern: pattern));
    if (anchor == CoachAnchor.depthFollowUp) {
      if (throwOnDepthCall) {
        throwOnDepthCall = false;
        throw StateError('simulated coach port failure for depth');
      }
      final next = _depthNext;
      _depthNext = const NoCoachQuestion();
      return next;
    }
    final next = _next;
    _next = const NoCoachQuestion();
    return next;
  }
}

/// Paired in-memory `CoachNoteStore` fake — records appends,
/// `recordInteraction` writes, and `forPlate` reads so the
/// `RecordCoachInteraction` use-case can be exercised end-to-end
/// without a real drift database.
class _FakeCoachNoteStore implements CoachNoteStore {
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
  final List<CoachInteractionLog> interactions = [];
  final Map<int, List<CoachNote>> byPlate = {};
  CoachInteractionResult _nextInteractionResult =
      const CoachInteractionRecorded(1);
  CoachNoteAppendResult? _nextAppendResult;
  int _nextNoteId = 100;
  int _nextInteractionId = 1;

  void forceInteractionFailure() {
    _nextInteractionResult = const CoachInteractionFailed(
      StoreFailure(encryptedStoreError: SecureKeyFailure()),
    );
  }

  void forceAppendFailure() {
    _nextAppendResult = const CoachNoteAppendFailure(
      StoreFailure(encryptedStoreError: SecureKeyFailure()),
    );
  }

  /// Pre-seed a coach note (used by the idempotent-second-tap test).
  void seed(CoachNote note) {
    byPlate.putIfAbsent(note.plateLogId, () => []).add(note);
  }

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    final forced = _nextAppendResult;
    if (forced != null) {
      _nextAppendResult = null;
      return forced;
    }
    final assigned = note.copyWith(id: _nextNoteId++);
    appended.add(assigned);
    byPlate.putIfAbsent(assigned.plateLogId, () => []).add(assigned);
    return CoachNoteAppended(assigned);
  }

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async {
    return List<CoachNote>.unmodifiable(
      byPlate[plateLogId] ?? const <CoachNote>[],
    );
  }

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async {
    interactions.add(log);
    final next = _nextInteractionResult;
    if (next is CoachInteractionFailed) {
      _nextInteractionResult = const CoachInteractionRecorded(1);
    } else {
      _nextInteractionResult = CoachInteractionRecorded(_nextInteractionId++);
    }
    return next;
  }
}

void main() {
  group('CoachInteraction + CoachInteractionLog value types (FR9)', () {
    test('CoachInteraction ships the exact v1 four-member set', () {
      expect(CoachInteraction.values, <CoachInteraction>[
        CoachInteraction.sure,
        CoachInteraction.askLater,
        CoachInteraction.dismiss,
        CoachInteraction.depthAnswer,
      ]);
    });

    test('CoachInteraction.persistedName matches the enum name', () {
      expect(CoachInteraction.sure.persistedName, 'sure');
      expect(CoachInteraction.askLater.persistedName, 'askLater');
      expect(CoachInteraction.dismiss.persistedName, 'dismiss');
      expect(CoachInteraction.depthAnswer.persistedName, 'depthAnswer');
    });

    test('CoachInteractionLog carries noteId + kind + at', () {
      final log = CoachInteractionLog(
        noteId: 7,
        kind: CoachInteraction.sure,
        at: DateTime.utc(2026, 8, 16, 12),
      );
      expect(log.noteId, 7);
      expect(log.kind, CoachInteraction.sure);
      expect(log.at, DateTime.utc(2026, 8, 16, 12));
    });

    test('CoachInteractionLog equality is structural', () {
      final a = CoachInteractionLog(
        noteId: 7,
        kind: CoachInteraction.sure,
        at: DateTime.utc(2026, 8, 16),
      );
      final b = CoachInteractionLog(
        noteId: 7,
        kind: CoachInteraction.sure,
        at: DateTime.utc(2026, 8, 16),
      );
      final c = CoachInteractionLog(
        noteId: 8,
        kind: CoachInteraction.sure,
        at: DateTime.utc(2026, 8, 16),
      );
      expect(a, b);
      expect(a.hashCode, b.hashCode);
      expect(a, isNot(c));
    });

    test('CoachInteractionLog.copyWith swaps fields immutably', () {
      final base = CoachInteractionLog(
        noteId: 1,
        kind: CoachInteraction.askLater,
        at: DateTime.utc(2026, 8, 16),
      );
      final updated = base.copyWith(kind: CoachInteraction.depthAnswer);
      expect(updated.kind, CoachInteraction.depthAnswer);
      expect(updated.noteId, 1);
      expect(updated.at, base.at);
    });
  });

  group('CoachInteractionResult sealed hierarchy', () {
    test('CoachInteractionRecorded carries the assigned id', () {
      const result = CoachInteractionRecorded(42);
      expect(result.interactionId, 42);
      expect(result, isA<CoachInteractionResult>());
    });

    test('CoachInteractionFailed carries a StoreFailure cause', () {
      const cause = StoreFailure(encryptedStoreError: SecureKeyFailure());
      const result = CoachInteractionFailed(cause);
      expect(result.cause, cause);
      expect(result, isA<CoachInteractionResult>());
    });
  });

  group('CoachAnchor enum extension (Story 2.3)', () {
    test('ships three anchors in declaration order', () {
      expect(CoachAnchor.values, <CoachAnchor>[
        CoachAnchor.postResolve,
        CoachAnchor.openPlate,
        CoachAnchor.depthFollowUp,
      ]);
    });

    test('depthFollowUp key token is stable kebab-cased', () {
      expect(CoachAnchor.depthFollowUp.keyToken, 'depth.followUp');
    });
  });

  group('RecordCoachInteraction use-case dispatch (FR5 / AD-3 / AD-5)', () {
    CoachNote postResolveNote({
      int id = 7,
      int plateLogId = 7,
      String questionKey = 'post.resolve.vegLight',
    }) {
      return CoachNote(
        id: id,
        plateLogId: plateLogId,
        anchor: CoachAnchor.postResolve,
        questionKey: questionKey,
        text: 'A handful of greens would round this plate out.',
        generatedAt: DateTime.utc(2026, 8, 16),
      );
    }

    test(
      '[sure] writes the interaction AND appends exactly one bounded '
      'depth follow-up CoachNote with anchor: depthFollowUp (HAPPY_PATH_SURE)',
      () async {
        final coach = _FakeCoach()
          ..emitDepth(
            const CoachFound(
              CoachQuestion(
                key: 'depth.followUp.vegLight',
                text: 'A handful of greens would round this plate out.',
                anchor: CoachAnchor.depthFollowUp,
                pattern: CompositionPattern.vegLight,
              ),
            ),
          );
        final store = _FakeCoachNoteStore();
        final useCase = RecordCoachInteraction(coach: coach, store: store);

        final result = await useCase(
          note: postResolveNote(),
          kind: CoachInteraction.sure,
        );

        expect(result, isA<RecordCoachInteractionSure>());
        expect(result.kind, CoachInteraction.sure);
        expect(store.interactions, hasLength(1));
        expect(store.interactions.first.kind, CoachInteraction.sure);
        expect(store.interactions.first.noteId, 7);
        expect(result.followedUpNote, isNotNull);
        expect(result.followedUpNote!.anchor, CoachAnchor.depthFollowUp);
        expect(result.followedUpNote!.questionKey, 'depth.followUp.vegLight');
        // Exactly ONE coach port call — for `depthFollowUp`.
        expect(coach.calls, hasLength(1));
        expect(coach.calls.first.anchor, CoachAnchor.depthFollowUp);
        expect(coach.calls.first.pattern, CompositionPattern.vegLight);
      },
    );

    test('second [sure] tap is idempotent — no extra notes '
        '(DEPTH_FOLLOWUP_ALREADY_VIEWED)', () async {
      final coach = _FakeCoach();
      final store = _FakeCoachNoteStore();
      // Pre-seed a depth follow-up note for plate 7.
      store.seed(
        CoachNote(
          id: 99,
          plateLogId: 7,
          anchor: CoachAnchor.depthFollowUp,
          questionKey: 'depth.followUp.vegLight',
          text: 'A handful of greens would round this plate out.',
          generatedAt: DateTime.utc(2026, 8, 16),
        ),
      );
      final useCase = RecordCoachInteraction(coach: coach, store: store);

      final result = await useCase(
        note: postResolveNote(),
        kind: CoachInteraction.sure,
      );

      expect(result.kind, CoachInteraction.sure);
      expect(
        result.followedUpNote,
        isNull,
        reason: 'second tap is a no-op on the depth-follow-up path',
      );
      // The interaction log still records the tap.
      expect(store.interactions, hasLength(1));
      // No coach port call when the follow-up already exists.
      expect(coach.calls, isEmpty);
    });

    test(
      '[ask later] writes the interaction only (HAPPY_PATH_ASK_LATER)',
      () async {
        final coach = _FakeCoach();
        final store = _FakeCoachNoteStore();
        final useCase = RecordCoachInteraction(coach: coach, store: store);

        final result = await useCase(
          note: postResolveNote(),
          kind: CoachInteraction.askLater,
        );

        expect(result, isA<RecordCoachInteractionAskLater>());
        expect(result.kind, CoachInteraction.askLater);
        expect(result.followedUpNote, isNull);
        expect(store.interactions, hasLength(1));
        expect(store.interactions.first.kind, CoachInteraction.askLater);
        // No coach port call, no append — quiet path.
        expect(coach.calls, isEmpty);
      },
    );

    test(
      '[dismiss] writes the interaction only (HAPPY_PATH_DISMISS)',
      () async {
        final coach = _FakeCoach();
        final store = _FakeCoachNoteStore();
        final useCase = RecordCoachInteraction(coach: coach, store: store);

        final result = await useCase(
          note: postResolveNote(),
          kind: CoachInteraction.dismiss,
        );

        expect(result, isA<RecordCoachInteractionDismiss>());
        expect(result.kind, CoachInteraction.dismiss);
        expect(result.followedUpNote, isNull);
        expect(store.interactions, hasLength(1));
        expect(store.interactions.first.kind, CoachInteraction.dismiss);
        expect(coach.calls, isEmpty);
      },
    );

    test('[depthAnswer] (depth panel close) writes the interaction only '
        '(HAPPY_PATH_DEPTH_CLOSE)', () async {
      final coach = _FakeCoach();
      final store = _FakeCoachNoteStore();
      final useCase = RecordCoachInteraction(coach: coach, store: store);

      final result = await useCase(
        note: postResolveNote(),
        kind: CoachInteraction.depthAnswer,
      );

      expect(result, isA<RecordCoachInteractionDepthAnswer>());
      expect(result.kind, CoachInteraction.depthAnswer);
      expect(result.followedUpNote, isNull);
      expect(store.interactions, hasLength(1));
      expect(store.interactions.first.kind, CoachInteraction.depthAnswer);
      expect(coach.calls, isEmpty);
    });

    test('coach port returning NoCoachQuestion for depthFollowUp collapses to '
        'no follow-up — interaction still recorded (calm degrade)', () async {
      final coach = _FakeCoach()..emitDepth(const NoCoachQuestion());
      final store = _FakeCoachNoteStore();
      final useCase = RecordCoachInteraction(coach: coach, store: store);

      final result = await useCase(
        note: postResolveNote(),
        kind: CoachInteraction.sure,
      );

      expect(result.kind, CoachInteraction.sure);
      expect(result.followedUpNote, isNull);
      expect(store.interactions, hasLength(1));
    });

    test('coach port throwing for depthFollowUp collapses to no follow-up '
        '(DEPTH_PORT_UNAVAILABLE)', () async {
      final coach = _FakeCoach()..throwOnDepthCall = true;
      final store = _FakeCoachNoteStore();
      final useCase = RecordCoachInteraction(coach: coach, store: store);

      final result = await useCase(
        note: postResolveNote(),
        kind: CoachInteraction.sure,
      );

      expect(result.kind, CoachInteraction.sure);
      expect(result.followedUpNote, isNull);
      expect(store.interactions, hasLength(1));
    });

    test('recordInteraction store failure collapses to typed '
        'CoachInteractionFailed (STORE_WRITE_FAILURE)', () async {
      final coach = _FakeCoach();
      final store = _FakeCoachNoteStore()..forceInteractionFailure();
      final useCase = RecordCoachInteraction(coach: coach, store: store);

      final result = await useCase(
        note: postResolveNote(),
        kind: CoachInteraction.askLater,
      );

      expect(result.recordInteractionOutcome, isA<CoachInteractionFailed>());
      // UI still reflects the user intent — `askLater` is the variant.
      expect(result.kind, CoachInteraction.askLater);
    });

    test(
      'append failure on the depth-follow-up path collapses to no note',
      () async {
        final coach = _FakeCoach()
          ..emitDepth(
            const CoachFound(
              CoachQuestion(
                key: 'depth.followUp.vegLight',
                text: 'A handful of greens would round this plate out.',
                anchor: CoachAnchor.depthFollowUp,
                pattern: CompositionPattern.vegLight,
              ),
            ),
          );
        final store = _FakeCoachNoteStore()..forceAppendFailure();
        final useCase = RecordCoachInteraction(coach: coach, store: store);

        final result = await useCase(
          note: postResolveNote(),
          kind: CoachInteraction.sure,
        );

        expect(result.kind, CoachInteraction.sure);
        expect(
          result.followedUpNote,
          isNull,
          reason: 'failed append must not record a follow-up',
        );
        // The interaction log still records the tap.
        expect(store.interactions, hasLength(1));
      },
    );

    test('note whose anchor is openPlate cannot spawn a depth follow-up '
        '(defensive)', () async {
      final coach = _FakeCoach();
      final store = _FakeCoachNoteStore();
      final useCase = RecordCoachInteraction(coach: coach, store: store);

      final openPlateNote = CoachNote(
        id: 7,
        plateLogId: 7,
        anchor: CoachAnchor.openPlate,
        questionKey: 'openPlate.vegLight',
        text: 'Greens would round this plate out.',
        generatedAt: DateTime.utc(2026, 8, 16),
      );

      final result = await useCase(
        note: openPlateNote,
        kind: CoachInteraction.sure,
      );

      expect(result.kind, CoachInteraction.sure);
      expect(result.followedUpNote, isNull);
      // The interaction log still records the tap.
      expect(store.interactions, hasLength(1));
      // No coach port call — depth follow-up is post-resolve-only.
      expect(coach.calls, isEmpty);
    });

    test('note whose questionKey cannot be parsed to a pattern collapses '
        'to no follow-up (defensive)', () async {
      final coach = _FakeCoach();
      final store = _FakeCoachNoteStore();
      final useCase = RecordCoachInteraction(coach: coach, store: store);

      final weirdNote = CoachNote(
        id: 7,
        plateLogId: 7,
        anchor: CoachAnchor.postResolve,
        questionKey: 'post.resolve.???',
        text: 'x',
        generatedAt: DateTime.utc(2026, 8, 16),
      );

      final result = await useCase(
        note: weirdNote,
        kind: CoachInteraction.sure,
      );

      expect(result.kind, CoachInteraction.sure);
      expect(result.followedUpNote, isNull);
      // The interaction log still records the tap.
      expect(store.interactions, hasLength(1));
      expect(coach.calls, isEmpty);
    });
  });

  group('Open-plate dismissal path (Story 2.3 / FR5 / UX-DR5 / F6)', () {
    test('dismissOpenPlateHint writes ONLY a dismissal marker — no synthetic '
        'CoachNote, no plateLogId: 0 row, no interaction log row', () async {
      final coach = _FakeCoach();
      final store = _FakeCoachNoteStore();
      final useCase = RecordCoachInteraction(coach: coach, store: store);
      final key = openPlateDismissalKey(
        day: DateTime(2026, 8, 16),
        slotName: 'lunch',
      );

      final result = await useCase.dismissOpenPlateHint(key);

      expect(key, 'openPlate:2026-08-16:lunch');
      expect(result, isA<CoachInteractionRecorded>());
      expect(store.dismissed, {key});
      expect(store.appended, isEmpty);
      expect(store.interactions, isEmpty);
      expect(coach.calls, isEmpty);
    });
  });

  group('Durable dismissal of a whisper (F6)', () {
    CoachNote note0() => CoachNote(
      id: 7,
      plateLogId: 1,
      anchor: CoachAnchor.postResolve,
      questionKey: 'post.resolve.vegLight',
      text: 'q',
      generatedAt: DateTime.utc(2026, 8, 16),
    );

    for (final kind in [CoachInteraction.askLater, CoachInteraction.dismiss]) {
      test('${kind.name} persists the note dismissal marker', () async {
        final store = _FakeCoachNoteStore();
        final useCase = RecordCoachInteraction(
          coach: _FakeCoach(),
          store: store,
        );
        await useCase(note: note0(), kind: kind);
        expect(store.dismissed, {coachNoteDismissalKey(7)});
        expect(store.interactions, hasLength(1));
      });
    }

    for (final kind in [CoachInteraction.sure, CoachInteraction.depthAnswer]) {
      test('${kind.name} does NOT dismiss the whisper', () async {
        final store = _FakeCoachNoteStore();
        final useCase = RecordCoachInteraction(
          coach: _FakeCoach(),
          store: store,
        );
        await useCase(note: note0(), kind: kind);
        expect(store.dismissed, isEmpty);
      });
    }
  });
}
