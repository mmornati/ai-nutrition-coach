// `WeekStrip` widget tests (Story 1.4 / UX-DR8 / NFR7 / NFR8).
//
// The strip is a derived view over `recentPlatesProvider`; tests cover
// the I/O matrix the spec calls out:
//
//   * empty week           → 7 outlined dots, whisper visible
//   * partial week         → mix of sage-filled and outlined dots
//   * happy path           → 7 sage-filled dots
//   * tap on a dot         → `selectedDateProvider` updates with the
//                             local-midnight date of that dot
//   * dark mode            → sage accent + whisper readable in dark
//   * Semantics            → each dot announces date + balance state
//   * re-emit after seed   → the strip refreshes when a new plate is
//                             pushed into the fake store (the
//                             Story-1.3 fake did not re-emit; the
//                             Story-1.4 swap to a broadcast controller
//                             is what makes this test green).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';
import 'package:ai_nutrition_coach/state/selected_date_provider.dart';
import 'package:ai_nutrition_coach/theme/app_tokens.dart';
import 'package:ai_nutrition_coach/widgets/week_strip.dart';

import '../_fakes/fake_encrypted_store.dart';

/// A `ProviderContainer` shape that lets a test pump the widget, read
/// the provider after a tap, and dispose both cleanly.
class _Harness {
  _Harness(this.container, this.store);

  final ProviderContainer container;
  final FakeEncryptedStore store;
}

Future<_Harness> _pump(
  WidgetTester tester, {
  FakeEncryptedStore? store,
  Brightness brightness = Brightness.light,
}) async {
  final fake = store ?? FakeEncryptedStore();
  final container = ProviderContainer(
    overrides: [encryptedStoreProvider.overrideWithValue(fake)],
  );
  // Dispose the container first (cancels StreamProvider subscriptions)
  // then close the fake's broadcast controller — the canonical teardown
  // order for a fake + ProviderContainer pair.
  addTearDown(fake.close);
  addTearDown(container.dispose);

  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        theme: ThemeData(brightness: brightness),
        home: Scaffold(
          backgroundColor: brightness == Brightness.dark
              ? AppPalette.dark.background
              : AppPalette.light.background,
          body: const Center(child: WeekStrip()),
        ),
      ),
    ),
  );
  // Drain the initial snapshot the fake's async* yields on subscribe.
  await tester.pumpAndSettle();
  return _Harness(container, fake);
}

/// All 7 dot tap targets — exposed via the strip's `Semantics` nodes
/// with `button: true`. The tap finder resolves to widgets inside the
/// strip in left-to-right order, matching `WeekStrip._sevenDaysEnding`.
Finder _dots() {
  return find.byWidgetPredicate(
    (w) => w is GestureDetector && w.behavior == HitTestBehavior.opaque,
  );
}

Future<void> _tapDot(WidgetTester tester, int index) async {
  final dots = _dots();
  expect(
    dots,
    findsNWidgets(WeekStrip.dayCount),
    reason: 'Expected ${WeekStrip.dayCount} tap targets on the strip',
  );
  await tester.tap(dots.at(index));
  await tester.pumpAndSettle();
}

void main() {
  group('WeekStrip', () {
    testWidgets('empty week: 7 outlined dots + mono whisper', (tester) async {
      await _pump(tester);

      // 7 dots on the strip — none filled.
      expect(_dots(), findsNWidgets(WeekStrip.dayCount));
      expect(
        find.descendant(
          of: find.byType(WeekStrip),
          matching: find.byWidgetPredicate(
            (w) =>
                w is Container &&
                w.decoration is BoxDecoration &&
                (w.decoration as BoxDecoration).color == Colors.transparent,
          ),
        ),
        findsNWidgets(WeekStrip.dayCount),
      );

      // The literal whisper copy — the spec-approved text.
      expect(
        find.text('no streaks · no countdowns · no guilt'),
        findsOneWidget,
      );
      final whisper = tester.widget<Text>(
        find.text('no streaks · no countdowns · no guilt'),
      );
      expect(whisper.style!.fontFamily, AppTypography.monoWhisper.fontFamily);
    });

    testWidgets('happy path: 7 sage-filled dots when every day has a plate', (
      tester,
    ) async {
      // Build a 7-day history (today + 6 prior days).
      final today = DateTime.now();
      final plates = <PlateLog>[
        for (var i = 0; i < WeekStrip.dayCount; i++)
          plateAt(
            i + 1,
            localTime: DateTime(today.year, today.month, today.day - i, 8),
            dish: 'Plate $i',
          ),
      ];
      await _pump(tester, store: FakeEncryptedStore(initial: plates));

      // 7 dots — every Container is sage-filled.
      expect(_dots(), findsNWidgets(WeekStrip.dayCount));
      expect(
        find.descendant(
          of: find.byType(WeekStrip),
          matching: find.byWidgetPredicate(
            (w) =>
                w is Container &&
                w.decoration is BoxDecoration &&
                (w.decoration as BoxDecoration).color == AppPalette.light.sage,
          ),
        ),
        findsNWidgets(WeekStrip.dayCount),
      );
    });

    testWidgets('partial week: 2 sage-filled dots, 5 outlined', (tester) async {
      final today = DateTime.now();
      // Plates on today and two days ago; rest are quiet.
      await _pump(
        tester,
        store: FakeEncryptedStore(
          initial: [
            plateAt(
              1,
              localTime: DateTime(today.year, today.month, today.day, 7, 30),
              dish: 'Oatmeal',
            ),
            plateAt(
              2,
              localTime: DateTime(today.year, today.month, today.day - 2, 12),
              dish: 'Salad',
            ),
          ],
        ),
      );

      expect(
        find.descendant(
          of: find.byType(WeekStrip),
          matching: find.byWidgetPredicate(
            (w) =>
                w is Container &&
                w.decoration is BoxDecoration &&
                (w.decoration as BoxDecoration).color == AppPalette.light.sage,
          ),
        ),
        findsNWidgets(2),
      );
      expect(
        find.descendant(
          of: find.byType(WeekStrip),
          matching: find.byWidgetPredicate(
            (w) =>
                w is Container &&
                w.decoration is BoxDecoration &&
                (w.decoration as BoxDecoration).color == Colors.transparent,
          ),
        ),
        findsNWidgets(WeekStrip.dayCount - 2),
      );
    });

    testWidgets('tap on a dot updates selectedDateProvider', (tester) async {
      final harness = await _pump(tester);

      // Initial state — null (today fallback).
      expect(harness.container.read(selectedDateProvider), isNull);

      // Tap the leftmost dot — 6 days ago. The strip computes today
      // from `DateTime.now()`, so the expected date is `today - 6d`.
      await _tapDot(tester, 0);

      final expected = _localMidnight(
        DateTime.now(),
      ).subtract(const Duration(days: WeekStrip.dayCount - 1));
      expect(harness.container.read(selectedDateProvider), expected);
    });

    testWidgets('tap on the rightmost dot sets selected date to today', (
      tester,
    ) async {
      final harness = await _pump(tester);

      // Rightmost = today (last in left-to-right order).
      await _tapDot(tester, WeekStrip.dayCount - 1);

      expect(
        harness.container.read(selectedDateProvider),
        _localMidnight(DateTime.now()),
      );
    });

    testWidgets('seed() on the fake store re-emits and the strip refreshes', (
      tester,
    ) async {
      // The 1.3 fake did not re-emit on seed(); Story 1.4 swaps it to a
      // broadcast controller. The week strip must update when a new
      // plate is pushed mid-test.
      final today = DateTime.now();
      final harness = await _pump(tester);

      // Empty week — all 7 dots are outlined.
      expect(
        find.descendant(
          of: find.byType(WeekStrip),
          matching: find.byWidgetPredicate(
            (w) =>
                w is Container &&
                w.decoration is BoxDecoration &&
                (w.decoration as BoxDecoration).color == AppPalette.light.sage,
          ),
        ),
        findsNothing,
      );

      // Push a plate for today.
      harness.store.seed([
        plateAt(
          1,
          localTime: DateTime(today.year, today.month, today.day, 7, 30),
          dish: 'Late Oatmeal',
        ),
      ]);
      await tester.pumpAndSettle();

      // Rightmost dot (today) is now sage-filled.
      expect(
        find.descendant(
          of: find.byType(WeekStrip),
          matching: find.byWidgetPredicate(
            (w) =>
                w is Container &&
                w.decoration is BoxDecoration &&
                (w.decoration as BoxDecoration).color == AppPalette.light.sage,
          ),
        ),
        findsOneWidget,
      );
    });

    testWidgets('dark mode: dots use AppPalette.dark palette', (tester) async {
      final today = DateTime.now();
      await _pump(
        tester,
        brightness: Brightness.dark,
        store: FakeEncryptedStore(
          initial: [
            plateAt(
              1,
              localTime: DateTime(today.year, today.month, today.day, 8),
              dish: 'Oatmeal',
            ),
          ],
        ),
      );

      // One filled dot — uses the dark-palette sage, not the light one.
      expect(
        find.descendant(
          of: find.byType(WeekStrip),
          matching: find.byWidgetPredicate(
            (w) =>
                w is Container &&
                w.decoration is BoxDecoration &&
                (w.decoration as BoxDecoration).color == AppPalette.dark.sage,
          ),
        ),
        findsOneWidget,
      );

      // Whisper readable in dark — `inkMuted` from the dark palette.
      final whisper = tester.widget<Text>(
        find.text('no streaks · no countdowns · no guilt'),
      );
      expect(whisper.style!.color, AppPalette.dark.inkMuted);
    });

    testWidgets('Semantics: each dot announces date + balance state', (
      tester,
    ) async {
      final today = DateTime.now();
      await _pump(
        tester,
        store: FakeEncryptedStore(
          initial: [
            // Today has a plate — that dot announces "balanced".
            plateAt(
              1,
              localTime: DateTime(today.year, today.month, today.day, 8),
              dish: 'Oatmeal',
            ),
          ],
        ),
      );

      // The SemanticsHandle must be released before the test ends —
      // tester.ensureSemantics() returns one and the binding asserts
      // every active handle is disposed at teardown.
      final handle = tester.ensureSemantics();
      try {
        final dotLabels = <String>[];
        for (var i = 0; i < WeekStrip.dayCount; i++) {
          final sem = tester.getSemantics(_dots().at(i));
          dotLabels.add(sem.label);
        }

        // Today (rightmost) is balanced; the rest are quiet.
        final rightmost = dotLabels.last;
        expect(rightmost, endsWith('balanced'));
        expect(rightmost, contains(_weekdayName(DateTime.now().weekday)));

        for (var i = 0; i < WeekStrip.dayCount - 1; i++) {
          expect(
            dotLabels[i],
            endsWith('quiet'),
            reason: 'day index $i should be quiet',
          );
        }
      } finally {
        handle.dispose();
      }
    });

    testWidgets('every dot has a hit target ≥48px', (tester) async {
      await _pump(tester);

      for (var i = 0; i < WeekStrip.dayCount; i++) {
        final size = tester.getSize(_dots().at(i));
        expect(
          size.width,
          greaterThanOrEqualTo(AppTouchTargets.min),
          reason: 'dot $i width ${size.width} below 48px',
        );
        expect(
          size.height,
          greaterThanOrEqualTo(AppTouchTargets.min),
          reason: 'dot $i height ${size.height} below 48px',
        );
      }
    });
  });
}

DateTime _localMidnight(DateTime moment) {
  return DateTime(moment.year, moment.month, moment.day);
}

String _weekdayName(int weekday) {
  const names = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];
  return names[weekday - 1];
}
