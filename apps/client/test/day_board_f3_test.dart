// Day Board (security review F3 / F6 / F8 / F9): several plates per slot, the
// late bucket, calendar-day boundaries (DST), the midnight refresh, bounded
// range reads, the durable whisper, and the balance arc from real food
// groups.
//
// The DST cases only mean something in a zone with daylight saving;
// `scripts/verify.sh` re-runs this file with `TZ=Europe/Paris`.

import 'dart:io' show Platform;

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/screens/day_board_screen.dart';
import 'package:ai_nutrition_coach/state/clock_provider.dart';
import 'package:ai_nutrition_coach/state/coach_note_provider.dart';
import 'package:ai_nutrition_coach/state/coach_provider.dart';
import 'package:ai_nutrition_coach/state/day_board_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';
import 'package:ai_nutrition_coach/widgets/balance_arc.dart';
import 'package:ai_nutrition_coach/widgets/coach_whisper.dart';
import 'package:ai_nutrition_coach/widgets/open_dent.dart';
import 'package:ai_nutrition_coach/widgets/plate_row.dart';

import '_fakes/fake_encrypted_store.dart';

PlateLog _plate(int id, DateTime local, String dish) =>
    plateAt(id, localTime: local, dish: dish);

Widget _app(
  FakeEncryptedStore store, {
  DateTime Function()? clock,
  FakeCoachNoteStore? notes,
  FakeCoach? coach,
}) {
  return ProviderScope(
    overrides: [
      encryptedStoreProvider.overrideWithValue(store),
      coachProvider.overrideWithValue(coach ?? FakeCoach()),
      coachNoteStoreProvider.overrideWithValue(notes ?? FakeCoachNoteStore()),
      clockProvider.overrideWithValue(clock ?? () => DateTime(2026, 8, 15, 12)),
    ],
    child: const MaterialApp(home: DayBoardScreen()),
  );
}

void main() {
  final day = DateTime(2026, 8, 15);

  group('classifyForDate: slots hold LISTS of plates', () {
    test('two lunches are both kept, in time order', () {
      final board = classifyForDate([
        _plate(2, DateTime(2026, 8, 15, 13, 30), 'Late lunch'),
        _plate(1, DateTime(2026, 8, 15, 11, 5), 'Early lunch'),
      ], date: day);
      final lunch = board.slot(MealSlot.lunch);
      expect(lunch.plates.map((p) => p.id), [1, 2]);
      expect(lunch.isOpen, isFalse);
      expect(board.slot(MealSlot.breakfast).isOpen, isTrue);
      expect(board.allPlates.map((p) => p.id), [1, 2]);
    });

    test('every hour of the day has a slot (no plate is dropped)', () {
      for (var h = 0; h < 24; h++) {
        final board = classifyForDate([
          _plate(h + 1, DateTime(2026, 8, 15, h, 30), 'p$h'),
        ], date: day);
        expect(board.allPlates, hasLength(1), reason: 'hour $h');
      }
    });

    test('slot boundaries', () {
      MealSlot at(int h, [int m = 0]) => MealSlot.forHour(h);
      expect(at(4), MealSlot.late);
      expect(at(5), MealSlot.breakfast);
      expect(at(10), MealSlot.breakfast);
      expect(at(11), MealSlot.lunch);
      expect(at(15), MealSlot.lunch);
      expect(at(16), MealSlot.dinner);
      expect(at(22), MealSlot.dinner);
      expect(at(23), MealSlot.late);
      expect(at(0), MealSlot.late);
    });

    test('23:00-04:59 land in the late bucket, which only shows when used', () {
      final empty = classifyForDate(const [], date: day);
      expect(empty.visibleSlots.map((s) => s.slot), [
        MealSlot.breakfast,
        MealSlot.lunch,
        MealSlot.dinner,
      ]);

      final night = classifyForDate([
        _plate(1, DateTime(2026, 8, 15, 23, 15), 'Midnight snack'),
        _plate(2, DateTime(2026, 8, 15, 0, 45), 'After midnight'),
        _plate(3, DateTime(2026, 8, 15, 4, 59), 'Very early'),
      ], date: day);
      expect(night.slot(MealSlot.late).plates.map((p) => p.id), [2, 3, 1]);
      expect(night.visibleSlots.last.slot, MealSlot.late);
    });

    test('plates from another day are ignored', () {
      final board = classifyForDate([
        _plate(1, DateTime(2026, 8, 14, 23, 59, 59), 'yesterday'),
        _plate(2, DateTime(2026, 8, 16), 'tomorrow, 00:00'),
        _plate(3, DateTime(2026, 8, 15), 'today, 00:00'),
      ], date: day);
      expect(board.allPlates.map((p) => p.id), [3]);
    });

    test('the unmodifiable board cannot be edited by a reader', () {
      final board = classifyForDate(const [], date: day);
      expect(() => board.slots.clear(), throwsUnsupportedError);
      expect(
        () => board.slot(MealSlot.lunch).plates.add(_plate(1, day, 'x')),
        throwsUnsupportedError,
      );
    });
  });

  group('across a DST change (needs a DST zone, e.g. TZ=Europe/Paris)', () {
    final isDstZone =
        DateTime(2026, 7, 1).timeZoneOffset !=
        DateTime(2026, 1, 1).timeZoneOffset;
    final skip = isDstZone ? false : 'local zone has no DST';

    test(
      'AI_NUTRITION_COACH_REQUIRE_DST=1 means the zone MUST have DST (never a '
      'silent skip)',
      () {
        if (Platform.environment['AI_NUTRITION_COACH_REQUIRE_DST'] == '1') {
          expect(
            isDstZone,
            isTrue,
            reason:
                'test:dst must run in a daylight-saving zone (TZ is '
                '${Platform.environment['TZ']}); the DST assertions would '
                'otherwise be skipped',
          );
        }
      },
    );

    test(
      'spring-forward day (23h): 23:30 stays in the day, 00:10 after does not',
      () {
        final springDay = DateTime(2026, 3, 29);
        final board = classifyForDate([
          _plate(1, DateTime(2026, 3, 29, 23, 30), 'late'),
          _plate(2, DateTime(2026, 3, 30, 0, 10), 'next day'),
          _plate(3, DateTime(2026, 3, 29, 3, 30), 'after the jump'),
        ], date: springDay);
        expect(board.allPlates.map((p) => p.id), [3, 1]);
        // The board date itself is the calendar day.
        expect(board.date, DateTime(2026, 3, 29));
      },
      skip: skip,
    );

    test('fall-back day (25h): both 02:30s and 23:30 are in the day', () {
      final fallDay = DateTime(2026, 10, 25);
      final firstPass = DateTime.utc(2026, 10, 25, 0, 30); // 02:30 CEST
      final secondPass = DateTime.utc(2026, 10, 25, 1, 30); // 02:30 CET
      final board = classifyForDate([
        PlateLog(id: 1, loggedAtUtc: firstPass, entries: const []),
        PlateLog(id: 2, loggedAtUtc: secondPass, entries: const []),
        _plate(3, DateTime(2026, 10, 25, 23, 30), 'late'),
        _plate(4, DateTime(2026, 10, 26, 0, 10), 'next day'),
      ], date: fallDay);
      expect(board.allPlates.map((p) => p.id), [1, 2, 3]);
    }, skip: skip);

    test('the day range used for the store read is the calendar day', () {
      final range = localDayRange(DateTime(2026, 3, 29, 15));
      expect(range.from, DateTime(2026, 3, 29));
      expect(range.to, DateTime(2026, 3, 30));
      expect(range.to.difference(range.from), const Duration(hours: 23));
    }, skip: skip);
  });

  group('the board', () {
    testWidgets('shows both plates of a shared slot, each as its own row', (
      tester,
    ) async {
      final store = FakeEncryptedStore(
        initial: [
          _plate(1, DateTime(2026, 8, 15, 11, 30), 'Soup'),
          _plate(2, DateTime(2026, 8, 15, 14, 0), 'Second helping'),
        ],
      );
      addTearDown(store.close);
      await tester.pumpWidget(_app(store));
      await tester.pumpAndSettle();

      expect(find.byType(PlateRow), findsNWidgets(2));
      expect(find.text('Soup'), findsOneWidget);
      expect(find.text('Second helping'), findsOneWidget);
      // Breakfast and dinner are still open dents; lunch is not.
      expect(find.byType(OpenDent), findsNWidgets(2));
    });

    testWidgets(
      'a 23:30 plate is shown in "Late / other" (it used to vanish)',
      (tester) async {
        final store = FakeEncryptedStore(
          initial: [_plate(1, DateTime(2026, 8, 15, 23, 30), 'Toast')],
        );
        addTearDown(store.close);
        await tester.pumpWidget(_app(store));
        await tester.pumpAndSettle();

        expect(find.text('Toast'), findsOneWidget);
        expect(find.text('Late / other'), findsOneWidget);
        expect(find.byType(OpenDent), findsNWidgets(3));
      },
    );

    testWidgets('no "Late / other" row on a day without a night plate', (
      tester,
    ) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);
      await tester.pumpWidget(_app(store));
      await tester.pumpAndSettle();
      expect(find.text('Late / other'), findsNothing);
    });

    testWidgets('F8: reads ONE day and ONE week from the store, not the '
        'whole history', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);
      await tester.pumpWidget(_app(store));
      await tester.pumpAndSettle();

      final ranges = store.watchedRanges.toSet();
      expect(
        ranges,
        contains((from: DateTime(2026, 8, 15), to: DateTime(2026, 8, 16))),
      );
      // The week strip: seven days ending today.
      expect(
        ranges,
        contains((from: DateTime(2026, 8, 9), to: DateTime(2026, 8, 16))),
      );
      expect(ranges, hasLength(2));
    });
  });

  group('midnight refresh (F3)', () {
    testWidgets('a board left open across midnight moves on to the new day', (
      tester,
    ) async {
      var now = DateTime(2026, 8, 15, 23, 58);
      final store = FakeEncryptedStore(
        initial: [
          _plate(1, DateTime(2026, 8, 15, 19, 0), 'Dinner on the 15th'),
          _plate(2, DateTime(2026, 8, 16, 8, 0), 'Breakfast on the 16th'),
        ],
      );
      addTearDown(store.close);
      await tester.pumpWidget(_app(store, clock: () => now));
      await tester.pumpAndSettle();
      expect(find.text('Dinner on the 15th'), findsOneWidget);
      expect(find.text('Breakfast on the 16th'), findsNothing);

      // The wall clock passes midnight; the screen's timer (2 minutes away)
      // fires and re-reads "today".
      now = DateTime(2026, 8, 16, 0, 0, 1);
      await tester.pump(const Duration(minutes: 2));
      await tester.pumpAndSettle();

      expect(find.text('Today'), findsOneWidget);
      expect(find.text('Dinner on the 15th'), findsNothing);
      expect(find.text('Breakfast on the 16th'), findsOneWidget);
    });

    testWidgets('a phone that slept through midnight re-reads today when the '
        'app comes back to the foreground', (tester) async {
      var now = DateTime(2026, 8, 15, 23, 58);
      final store = FakeEncryptedStore(
        initial: [
          _plate(1, DateTime(2026, 8, 15, 19, 0), 'Dinner on the 15th'),
          _plate(2, DateTime(2026, 8, 16, 8, 0), 'Breakfast on the 16th'),
        ],
      );
      addTearDown(store.close);
      await tester.pumpWidget(_app(store, clock: () => now));
      await tester.pumpAndSettle();
      expect(find.text('Dinner on the 15th'), findsOneWidget);

      // The process was suspended: the clock moved on, no timer fired.
      now = DateTime(2026, 8, 16, 7, 0);
      expect(find.text('Dinner on the 15th'), findsOneWidget);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();

      expect(find.text('Dinner on the 15th'), findsNothing);
      expect(find.text('Breakfast on the 16th'), findsOneWidget);

      // …and the timer was re-armed for the NEXT midnight (07:00 -> 17h).
      now = DateTime(2026, 8, 17, 0, 0, 1);
      await tester.pump(const Duration(hours: 17));
      await tester.pumpAndSettle();
      expect(find.text('Breakfast on the 16th'), findsNothing);
    });

    testWidgets('todayProvider follows the clock and is local midnight', (
      tester,
    ) async {
      var now = DateTime(2026, 8, 15, 17, 45);
      final container = ProviderContainer(
        overrides: [clockProvider.overrideWithValue(() => now)],
      );
      addTearDown(container.dispose);
      expect(container.read(todayProvider), DateTime(2026, 8, 15));
      now = DateTime(2026, 8, 16, 0, 5);
      expect(container.read(todayProvider), DateTime(2026, 8, 15));
      container.invalidate(todayProvider);
      expect(container.read(todayProvider), DateTime(2026, 8, 16));
    });
  });

  group('balance arc from real food groups (F9)', () {
    FoodEntry entry(int id, FoodGroup g) => FoodEntry(
      id: id,
      plateLogId: 1,
      databaseFood: DatabaseFood(
        sourceRef: 'x$id',
        displayName: 'food $id',
        source: SourceCatalog.manual,
        foodGroup: g,
      ),
      quantity: const QuantityRange(
        low: 1,
        high: 1,
        unit: 'serving',
        displayLabel: '~1',
      ),
    );

    testWidgets('quadrants fill for the groups ON the plate', (tester) async {
      final plate = PlateLog(
        id: 1,
        loggedAtUtc: DateTime(2026, 8, 15, 12).toUtc(),
        entries: [
          entry(1, FoodGroup.vegFruit),
          entry(2, FoodGroup.protein),
          entry(3, FoodGroup.other),
        ],
      );
      final store = FakeEncryptedStore(initial: [plate]);
      addTearDown(store.close);
      await tester.pumpWidget(_app(store));
      await tester.pumpAndSettle();

      final arc = tester.widget<BalanceArc>(find.byType(BalanceArc));
      expect(arc.filled, [true, true, false, false]);
    });

    testWidgets('a plate of unknown groups fills nothing (honest, not 3/4)', (
      tester,
    ) async {
      final store = FakeEncryptedStore(
        initial: [_plate(1, DateTime(2026, 8, 15, 12), 'Mystery')],
      );
      addTearDown(store.close);
      await tester.pumpWidget(_app(store));
      await tester.pumpAndSettle();
      final arc = tester.widget<BalanceArc>(find.byType(BalanceArc));
      expect(arc.filled, [false, false, false, false]);
    });
  });

  group('the whisper (F6)', () {
    CoachNote note(int plateId) => CoachNote(
      id: 0,
      plateLogId: plateId,
      anchor: CoachAnchor.postResolve,
      questionKey: 'post.resolve.vegLight',
      text: 'A handful of greens would round this plate out.',
      generatedAt: DateTime.utc(2026, 8, 15, 12),
    );

    testWidgets('a note appended AFTER the plate row built still appears', (
      tester,
    ) async {
      final store = FakeEncryptedStore(
        initial: [_plate(1, DateTime(2026, 8, 15, 12), 'Rice')],
      );
      final notes = FakeCoachNoteStore();
      addTearDown(store.close);
      await tester.pumpWidget(_app(store, notes: notes));
      await tester.pumpAndSettle();
      expect(find.byType(CoachWhisper), findsNothing);

      // The post-resolve generator writes the note a moment after commit.
      await notes.append(note(1));
      await tester.pumpAndSettle();
      expect(find.byType(CoachWhisper), findsOneWidget);
    });

    testWidgets('"ask later" is durable: gone now, gone after a restart', (
      tester,
    ) async {
      final store = FakeEncryptedStore(
        initial: [_plate(1, DateTime(2026, 8, 15, 12), 'Rice')],
      );
      final notes = FakeCoachNoteStore();
      addTearDown(store.close);
      await notes.append(note(1));

      await tester.pumpWidget(_app(store, notes: notes));
      await tester.pumpAndSettle();
      expect(find.byType(CoachWhisper), findsOneWidget);

      await tester.tap(find.text('ask later'));
      await tester.pumpAndSettle();
      expect(find.byType(CoachWhisper), findsNothing);
      expect(notes.dismissed, {coachNoteDismissalKey(1)});

      // "Restart": a brand-new scope over the same persisted store.
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(_app(store, notes: notes));
      await tester.pumpAndSettle();
      expect(find.byType(CoachWhisper), findsNothing);
    });
  });
}
