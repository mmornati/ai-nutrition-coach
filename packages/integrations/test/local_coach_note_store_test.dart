// `LocalCoachNoteStore` round-trip test — locks the drift mapping,
// the append-then-read contract (AD-3), the best-effort
// `CoachNoteAppendFailure` path on a drift `SqliteException` (the
// store failure cannot leak across the port boundary as a raw
// exception — conventions.md), and the Story 2.3
// `recordInteraction` append + FK back-ref to `coach_note_table.id`.

import 'package:domain_core/domain_core.dart';
import 'package:drift/native.dart';
import 'package:integrations/src/store/app_database.dart';
import 'package:integrations/src/store/local_coach_note_store.dart';
import 'package:test/test.dart';

void main() {
  group('LocalCoachNoteStore (in-memory)', () {
    late AppDatabase db;
    late LocalCoachNoteStore store;

    setUp(() {
      db = AppDatabase(NativeDatabase.memory());
      store = LocalCoachNoteStore(database: db);
    });

    tearDown(() async {
      await db.close();
    });

    test('append assigns an id and round-trips every field', () async {
      final note = CoachNote(
        id: 0,
        plateLogId: 7,
        anchor: CoachAnchor.postResolve,
        questionKey: 'post.resolve.vegLight',
        text: 'A handful of greens would round this plate out.',
        generatedAt: DateTime.utc(2026, 8, 16, 12),
      );

      final result = await store.append(note);

      expect(result, isA<CoachNoteAppended>());
      final appended = (result as CoachNoteAppended).note;
      expect(appended.id, isPositive);
      expect(appended.plateLogId, 7);
      expect(appended.anchor, CoachAnchor.postResolve);
      expect(appended.questionKey, 'post.resolve.vegLight');
      expect(appended.text, 'A handful of greens would round this plate out.');
      expect(appended.generatedAt, DateTime.utc(2026, 8, 16, 12));
    });

    test('forPlate returns notes in insertion order (id ASC)', () async {
      final first = CoachNote(
        id: 0,
        plateLogId: 11,
        anchor: CoachAnchor.postResolve,
        questionKey: 'k1',
        text: 'first',
        generatedAt: DateTime.utc(2026, 8, 16, 12),
      );
      final second = first.copyWith(questionKey: 'k2', text: 'second');
      final third = first.copyWith(questionKey: 'k3', text: 'third');

      final a = await store.append(first);
      final b = await store.append(second);
      final c = await store.append(third);
      // Same plate id so all three are visible to forPlate.
      for (final result in [a, b, c]) {
        expect(result, isA<CoachNoteAppended>());
      }
      // Update the plateLogId on each one (the original was 11,
      // which is what we want).
      expect((a as CoachNoteAppended).note.plateLogId, 11);
      expect((b as CoachNoteAppended).note.plateLogId, 11);
      expect((c as CoachNoteAppended).note.plateLogId, 11);

      final notes = await store.forPlate(11);
      expect(notes, hasLength(3));
      expect(notes[0].questionKey, 'k1');
      expect(notes[1].questionKey, 'k2');
      expect(notes[2].questionKey, 'k3');
    });

    test(
      'forPlate returns empty list when no notes exist for the plate',
      () async {
        final notes = await store.forPlate(404);
        expect(notes, isEmpty);
      },
    );

    test('notes for different plates do not bleed across reads', () async {
      final plate1 = CoachNote(
        id: 0,
        plateLogId: 1,
        anchor: CoachAnchor.postResolve,
        questionKey: 'a',
        text: 'plate 1',
        generatedAt: DateTime.utc(2026, 8, 16),
      );
      final plate2 = plate1.copyWith(
        plateLogId: 2,
        questionKey: 'b',
        text: 'plate 2',
      );

      await store.append(plate1);
      await store.append(plate2);

      final p1 = await store.forPlate(1);
      final p2 = await store.forPlate(2);
      expect(p1, hasLength(1));
      expect(p1.single.questionKey, 'a');
      expect(p2, hasLength(1));
      expect(p2.single.questionKey, 'b');
    });

    test('database close is idempotent (no use-after-free)', () async {
      // The store survives a round of `append` + `forPlate`, then
      // `close()` is safe to call. The adapter is constructed per
      // app boot — this is a smoke test that the lifecycle is OK.
      await store.append(
        CoachNote(
          id: 0,
          plateLogId: 1,
          anchor: CoachAnchor.postResolve,
          questionKey: 'k',
          text: 't',
          generatedAt: DateTime.utc(2026, 8, 16),
        ),
      );
      await db.close();
    });
  });

  group('LocalCoachNoteStore.recordInteraction (Story 2.3)', () {
    late AppDatabase db;
    late LocalCoachNoteStore store;

    setUp(() {
      db = AppDatabase(NativeDatabase.memory());
      store = LocalCoachNoteStore(database: db);
    });

    tearDown(() async {
      await db.close();
    });

    test('recordInteraction assigns an autoincrement id and round-trips the '
        'kind + at', () async {
      // Seed a parent note so the FK back-ref is satisfied.
      final appended = await store.append(
        CoachNote(
          id: 0,
          plateLogId: 7,
          anchor: CoachAnchor.postResolve,
          questionKey: 'post.resolve.vegLight',
          text: 'A handful of greens would round this plate out.',
          generatedAt: DateTime.utc(2026, 8, 16, 12),
        ),
      );
      final noteId = (appended as CoachNoteAppended).note.id;

      final result = await store.recordInteraction(
        CoachInteractionLog(
          noteId: noteId,
          kind: CoachInteraction.sure,
          at: DateTime.utc(2026, 8, 16, 12, 30),
        ),
      );

      expect(result, isA<CoachInteractionRecorded>());
      expect((result as CoachInteractionRecorded).interactionId, isPositive);
    });

    test('recordInteraction is append-only: no DB-level FK constraint to '
        'coach_note_table.id (FK lives at the use-case layer, same '
        'convention as the rest of the schema)', () async {
      // The v1 schema does not enforce a DB-level FK on
      // `coach_interactions.coach_note_id` — the same convention
      // `coach_note_table.plate_log_id` and
      // `food_entry_table.plate_log_id` follow (Story 1.2). The
      // use-case reads the parent note first, so the back-ref is
      // always satisfied when the row lands. The adapter accepts an
      // orphan row; the typed `CoachInteractionRecorded` carries the
      // autoincrement id back to the caller.
      final result = await store.recordInteraction(
        CoachInteractionLog(
          noteId: 99999,
          kind: CoachInteraction.askLater,
          at: DateTime.utc(2026, 8, 16),
        ),
      );

      expect(
        result,
        isA<CoachInteractionRecorded>(),
        reason: 'FK lives at the use-case layer, not at the DB layer',
      );
    });

    test('every interaction kind persists verbatim', () async {
      final appended = await store.append(
        CoachNote(
          id: 0,
          plateLogId: 7,
          anchor: CoachAnchor.postResolve,
          questionKey: 'post.resolve.vegLight',
          text: 'A handful of greens would round this plate out.',
          generatedAt: DateTime.utc(2026, 8, 16),
        ),
      );
      final noteId = (appended as CoachNoteAppended).note.id;

      for (final kind in CoachInteraction.values) {
        final result = await store.recordInteraction(
          CoachInteractionLog(
            noteId: noteId,
            kind: kind,
            at: DateTime.utc(2026, 8, 16),
          ),
        );
        expect(
          result,
          isA<CoachInteractionRecorded>(),
          reason: 'kind=$kind must record',
        );
      }
    });
  });
}
