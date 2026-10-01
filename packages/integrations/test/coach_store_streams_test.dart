// `LocalCoachNoteStore` streams + durable dismissals (security review F6),
// on the real drift schema.

import 'package:domain_core/domain_core.dart';
import 'package:drift/native.dart';
import 'package:integrations/integrations.dart';
import 'package:integrations/src/store/app_database.dart';
import 'package:test/test.dart';

CoachNote _note(int plateId, String key) => CoachNote(
  id: 0,
  plateLogId: plateId,
  anchor: CoachAnchor.postResolve,
  questionKey: key,
  text: 'text $key',
  generatedAt: DateTime.utc(2026, 8, 16, 12),
);

void main() {
  late AppDatabase db;
  late LocalCoachNoteStore store;

  setUp(() {
    db = AppDatabase(NativeDatabase.memory());
    store = LocalCoachNoteStore(database: db);
  });
  tearDown(() => db.close());

  test('watchForPlate emits the empty list, then the note appended AFTER '
      'the subscription (the F6 race)', () async {
    final seen = <List<String>>[];
    final sub = store
        .watchForPlate(5)
        .listen((notes) => seen.add([for (final n in notes) n.questionKey]));
    addTearDown(sub.cancel);
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(seen.last, isEmpty);

    await store.append(_note(5, 'k1'));
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(seen.last, ['k1']);

    // A note for another plate does not leak in.
    await store.append(_note(6, 'other'));
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(seen.last, ['k1']);
  });

  test(
    'recordDismissal is idempotent and watchDismissals reflects it',
    () async {
      final seen = <Set<String>>[];
      final sub = store.watchDismissals().listen(seen.add);
      addTearDown(sub.cancel);
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(seen.last, isEmpty);

      expect(
        await store.recordDismissal('note:3'),
        isA<CoachInteractionRecorded>(),
      );
      expect(
        await store.recordDismissal('note:3'),
        isA<CoachInteractionRecorded>(),
      );
      final todayKey = openPlateDismissalKey(
        day: DateTime.now(),
        slotName: 'lunch',
      );
      await store.recordDismissal(todayKey);
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(seen.last, {'note:3', todayKey});
      expect((await db.select(db.coachDismissalTable).get()), hasLength(2));
    },
  );

  test('dismissals survive a reopen (they are in the database)', () async {
    await store.recordDismissal('note:9');
    final again = LocalCoachNoteStore(database: db);
    expect(await again.watchDismissals().first, {'note:9'});
  });

  test(
    'no synthetic plateLogId: 0 note is needed for an open-plate hint',
    () async {
      await store.recordDismissal('openPlate:2026-08-16:dinner');
      expect(await db.select(db.coachNoteTable).get(), isEmpty);
    },
  );

  test(
    'the use-case writes the durable marker through the real store',
    () async {
      final appended =
          await store.append(_note(1, 'post.resolve.vegLight'))
              as CoachNoteAppended;
      final useCase = RecordCoachInteraction(
        coach: const TemplateCoach(),
        store: store,
      );
      await useCase(note: appended.note, kind: CoachInteraction.askLater);
      expect(await store.watchDismissals().first, {
        coachNoteDismissalKey(appended.note.id),
      });
    },
  );

  test('old open-plate keys are pruned on write; note keys and recent keys '
      'stay', () async {
    final today = DateTime.now();
    String key(DateTime d, String slot) =>
        openPlateDismissalKey(day: d, slotName: slot);
    final old = addCalendarDays(today, -30);
    final recent = addCalendarDays(today, -3);
    // Seed an old key directly (as an old build would have left it).
    await db.customStatement(
      'INSERT INTO coach_dismissal_table (dismissal_key, dismissed_at_utc) '
      "VALUES (?, '2026-01-01T00:00:00.000Z')",
      [key(old, 'lunch')],
    );
    await store.recordDismissal('note:1');
    await store.recordDismissal(key(recent, 'dinner'));
    await store.recordDismissal(key(today, 'breakfast'));
    final kept = await store.watchDismissals().first;
    expect(kept, {'note:1', key(recent, 'dinner'), key(today, 'breakfast')});
  });
}
