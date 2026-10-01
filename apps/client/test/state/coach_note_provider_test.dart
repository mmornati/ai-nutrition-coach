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
import 'package:openplate_client/state/coach_note_provider.dart';
import 'package:openplate_client/state/coach_provider.dart';
import 'package:openplate_client/state/record_plate_provider.dart';

import '../_fakes/fake_encrypted_store.dart';

/// First emission of the (autoDispose) note stream, kept alive while read.
Future<List<CoachNote>> _notes(ProviderContainer container, int plateLogId) {
  final sub = container.listen(
    coachNotesForPlateProvider(plateLogId),
    (_, _) {},
  );
  addTearDown(sub.close);
  return container.read(coachNotesForPlateProvider(plateLogId).future);
}

ProviderContainer _container({
  Coach? coach,
  CoachNoteStore? coachNotes,
  EncryptedStore? store,
}) {
  final container = ProviderContainer(
    overrides: [
      encryptedStoreProvider.overrideWithValue(store ?? FakeEncryptedStore()),
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
          encryptedStoreProvider.overrideWithValue(FakeEncryptedStore()),
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
      final store = FakeCoachNoteStore();
      final container = _container(coach: coach, coachNotes: store);

      final generator = container.read(coachNoteGeneratorProvider);
      expect(generator, isA<CoachNoteGenerator>());
    });

    test('RecordPlate use-case reads the generator from the provider', () {
      final coach = FakeCoach();
      final store = FakeCoachNoteStore();
      final container = _container(coach: coach, coachNotes: store);

      final useCase = container.read(recordPlateProvider);
      expect(useCase, isA<RecordPlate>());
    });
  });

  group('coachNotesForPlateProvider', () {
    test(
      'returns empty list when the store has no notes for the plate',
      () async {
        final store = FakeCoachNoteStore();
        final container = _container(coach: FakeCoach(), coachNotes: store);

        final notes = await _notes(container, 404);
        expect(notes, isEmpty);
      },
    );

    test('returns notes the store holds for the plate', () async {
      final store = FakeCoachNoteStore();
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

      final notes7 = await _notes(container, 7);
      expect(notes7, hasLength(1));
      expect(notes7.first.questionKey, 'post.resolve.vegLight');

      final notes9 = await _notes(container, 9);
      expect(notes9, hasLength(1));
      expect(notes9.first.questionKey, 'post.resolve.proteinHeavy');

      final notesEmpty = await _notes(container, 404);
      expect(notesEmpty, isEmpty);
    });

    test(
      'different plate ids return different note lists (no cross-bleed)',
      () async {
        final store = FakeCoachNoteStore();
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

        final p1 = await _notes(container, 1);
        final p2 = await _notes(container, 2);
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
        final store = FakeCoachNoteStore();
        final fakeStore = FakeEncryptedStore();
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
        final notes = await _notes(container, plate.id);
        expect(notes, hasLength(1));
        expect(notes.first.questionKey, 'post.resolve.balanced');
      },
    );
  });

  group('F6: the whisper race', () {
    CoachNote note(int plateId, String key) => CoachNote(
      id: 0,
      plateLogId: plateId,
      anchor: CoachAnchor.postResolve,
      questionKey: key,
      text: key,
      generatedAt: DateTime.utc(2026, 8, 16),
    );

    test(
      'a note appended AFTER the first read still arrives (the old FutureProvider '
      'cached the empty list)',
      () async {
        final store = FakeCoachNoteStore();
        final container = _container(coach: FakeCoach(), coachNotes: store);
        final seen = <List<String>>[];
        final sub = container.listen(
          coachNotesForPlateProvider(3),
          (_, next) => seen.add([
            for (final n in next.value ?? const <CoachNote>[]) n.questionKey,
          ]),
          fireImmediately: true,
        );
        addTearDown(sub.close);
        await pumpEventQueue();
        expect(seen.last, isEmpty);

        await store.append(note(3, 'late-note'));
        await pumpEventQueue();
        expect(seen.last, ['late-note']);
      },
    );

    test('dismissals are a stream of durable keys', () async {
      final store = FakeCoachNoteStore();
      final container = _container(coach: FakeCoach(), coachNotes: store);
      final sub = container.listen(coachDismissalsProvider, (_, _) {});
      addTearDown(sub.close);
      await pumpEventQueue();
      expect(container.read(coachDismissalsProvider).value, isEmpty);
      await store.recordDismissal('note:1');
      await pumpEventQueue();
      expect(container.read(coachDismissalsProvider).value, {'note:1'});
    });
  });

  group('F6: depthFollowUpProvider has no side effect until request()', () {
    final postResolve = CoachNote(
      id: 5,
      plateLogId: 2,
      anchor: CoachAnchor.postResolve,
      questionKey: 'post.resolve.vegLight',
      text: 'greens?',
      generatedAt: DateTime.utc(2026, 8, 16),
    );

    CoachFound depthQuestion() => const CoachFound(
      CoachQuestion(
        key: 'depth.followUp.vegLight',
        text: 'What would make greens easy?',
        anchor: CoachAnchor.depthFollowUp,
        pattern: CompositionPattern.vegLight,
      ),
    );

    test(
      'building / reading / listening does NOT call the coach or write',
      () async {
        final coach = FakeCoach()..emit(depthQuestion());
        final store = FakeCoachNoteStore();
        final container = _container(coach: coach, coachNotes: store);
        final sub = container.listen(
          depthFollowUpProvider(postResolve),
          (_, _) {},
        );
        addTearDown(sub.close);
        expect(
          container.read(depthFollowUpProvider(postResolve)),
          isA<DepthFollowUpIdle>(),
        );
        container.invalidate(depthFollowUpProvider(postResolve));
        container.read(depthFollowUpProvider(postResolve));
        await pumpEventQueue();
        expect(coach.calls, isEmpty);
        expect(store.interactions, isEmpty);
        expect(store.byPlate, isEmpty);
      },
    );

    test('request() records [sure] once and publishes the follow-up', () async {
      final coach = FakeCoach()..emit(depthQuestion());
      final store = FakeCoachNoteStore();
      final container = _container(coach: coach, coachNotes: store);
      final sub = container.listen(
        depthFollowUpProvider(postResolve),
        (_, _) {},
      );
      addTearDown(sub.close);
      final notifier = container.read(
        depthFollowUpProvider(postResolve).notifier,
      );
      await notifier.request();
      final state = container.read(depthFollowUpProvider(postResolve));
      expect(state, isA<DepthFollowUpReady>());
      expect(
        (state as DepthFollowUpReady).note!.text,
        'What would make greens easy?',
      );
      expect(store.interactions.single.kind, CoachInteraction.sure);

      // A second tap does nothing.
      await notifier.request();
      expect(store.interactions, hasLength(1));
    });

    test('a coach with nothing to say publishes a null follow-up', () async {
      final store = FakeCoachNoteStore();
      final container = _container(coach: FakeCoach(), coachNotes: store);
      final sub = container.listen(
        depthFollowUpProvider(postResolve),
        (_, _) {},
      );
      addTearDown(sub.close);
      await container
          .read(depthFollowUpProvider(postResolve).notifier)
          .request();
      final state = container.read(depthFollowUpProvider(postResolve));
      expect((state as DepthFollowUpReady).note, isNull);
    });
  });
}
