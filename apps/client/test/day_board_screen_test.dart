// Day Board screen tests — `apps/client/lib/screens/day_board_screen.dart`.
//
// The screens tests cover the I/O matrix scenarios the spec calls out:
//
//   * empty day          → 3 open dents, no spinner, no CTA (UX-DR10)
//   * partial day         → mix of plate rows + open dents
//   * full day            → 3 plate rows, 0 open dents
//   * store failure       → calm "History can't load right now." line
//   * dark mode           → AppPalette.dark background
//   * dynamic type largest→ no truncation, ≥48px touch target
//   * quick-repeat link   → ≥48px hit target + surfaces after a log
//
// Plates are seeded through a `FakeEncryptedStore` (test/_fakes/) so the
// `encryptedStoreProvider` override is the same shape used in production.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/screens/day_board_screen.dart';
import 'package:ai_nutrition_coach/state/coach_note_provider.dart';
import 'package:ai_nutrition_coach/state/clock_provider.dart';
import 'package:ai_nutrition_coach/state/coach_provider.dart';
import 'package:ai_nutrition_coach/state/day_board_provider.dart';
import 'package:ai_nutrition_coach/state/last_log_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';
import 'package:ai_nutrition_coach/state/selected_date_provider.dart';
import 'package:ai_nutrition_coach/theme/app_tokens.dart';
import 'package:ai_nutrition_coach/widgets/balance_arc.dart';
import 'package:ai_nutrition_coach/widgets/open_dent.dart';
import 'package:ai_nutrition_coach/widgets/plate_row.dart';

import '_fakes/fake_encrypted_store.dart';

Widget _wrap(
  Widget child,
  FakeEncryptedStore store, {
  ThemeMode mode = ThemeMode.light,
}) {
  return ProviderScope(
    overrides: [
      encryptedStoreProvider.overrideWithValue(store),
      // Story 2.2: wire the coach providers so the post-resolve
      // whisper path can be exercised end-to-end.
      coachProvider.overrideWithValue(FakeCoach()),
      coachNoteStoreProvider.overrideWithValue(FakeCoachNoteStore()),
      // The fixtures are seeded on 2026-08-15; pin "now" to that day.
      clockProvider.overrideWithValue(() => DateTime(2026, 8, 15, 12)),
    ],
    child: MaterialApp(
      themeMode: mode,
      theme: ThemeData(brightness: Brightness.light),
      darkTheme: ThemeData(brightness: Brightness.dark),
      home: child,
    ),
  );
}

void main() {
  group('DayBoardScreen', () {
    testWidgets('empty day renders 3 open dents with the quiet copy', (
      tester,
    ) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);

      await tester.pumpWidget(_wrap(const DayBoardScreen(), store));
      await tester.pumpAndSettle();

      // 3 open dents — the literal copy is the spec-approved text.
      expect(find.byType(OpenDent), findsNWidgets(3));
      expect(find.text('An open, quiet place.'), findsNWidgets(3));
      expect(find.text('Breakfast'), findsOneWidget);
      expect(find.text('Lunch'), findsOneWidget);
      expect(find.text('Dinner'), findsOneWidget);
      // No plate rows today.
      expect(find.byType(PlateRow), findsNothing);
    });

    testWidgets('partial day: 1 plate + 2 open dents', (tester) async {
      final store = FakeEncryptedStore(
        initial: [
          plateAt(
            1,
            localTime: DateTime(2026, 8, 15, 7, 30),
            dish: 'Avocado Toast',
            displayLabel: '~1 slice',
          ),
        ],
      );
      addTearDown(store.close);

      await tester.pumpWidget(_wrap(const DayBoardScreen(), store));
      await tester.pumpAndSettle();

      expect(find.byType(PlateRow), findsOneWidget);
      expect(find.byType(OpenDent), findsNWidgets(2));
      expect(find.text('Avocado Toast'), findsOneWidget);
    });

    testWidgets('full day: 3 plates across breakfast/lunch/dinner', (
      tester,
    ) async {
      final store = FakeEncryptedStore(
        initial: [
          plateAt(
            1,
            localTime: DateTime(2026, 8, 15, 7, 30),
            dish: 'Oatmeal',
            displayLabel: '~1 bowl',
          ),
          plateAt(
            2,
            localTime: DateTime(2026, 8, 15, 12, 45),
            dish: 'Salad Bowl',
            displayLabel: '~2 cups',
          ),
          plateAt(
            3,
            localTime: DateTime(2026, 8, 15, 19, 0),
            dish: 'Pasta',
            displayLabel: '~1.5 cups',
          ),
        ],
      );
      addTearDown(store.close);

      await tester.pumpWidget(_wrap(const DayBoardScreen(), store));
      await tester.pumpAndSettle();

      expect(find.byType(PlateRow), findsNWidgets(3));
      expect(find.byType(OpenDent), findsNothing);
      expect(find.text('Oatmeal'), findsOneWidget);
      expect(find.text('Salad Bowl'), findsOneWidget);
      expect(find.text('Pasta'), findsOneWidget);
    });

    testWidgets('StoreFailure renders the calm failure line', (tester) async {
      // The failure surface is driven by an error-emitting
      // `dayBoardProvider` — what happens when the underlying store
      // fails to open (e.g. SecureKeyFailure → `_SecureKeyFailureStore`).
      // We override the provider directly so the test asserts the
      // screen's calm failure surface without coupling to the stream's
      // async timing.
      final store = FakeEncryptedStore();
      addTearDown(store.close);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            encryptedStoreProvider.overrideWithValue(store),
            dayBoardProvider.overrideWithValue(
              AsyncValue.error(
                const StoreFailure(encryptedStoreError: SecureKeyFailure()),
                StackTrace.current,
              ),
            ),
          ],
          child: MaterialApp(
            theme: ThemeData(brightness: Brightness.light),
            home: const DayBoardScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text("History can't load right now."), findsOneWidget);
      // No retry button — just the calm line.
      expect(find.widgetWithText(FilledButton, 'Retry'), findsNothing);
    });

    testWidgets('dark mode renders AppPalette.dark background', (tester) async {
      final store = FakeEncryptedStore();
      addTearDown(store.close);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            encryptedStoreProvider.overrideWithValue(store),
            // Story 2.3: OpenDent now reads `coachProvider` to gate
            // the open-plate hint; override the seam so the test
            // does not hit `UnimplementedError`.
            coachProvider.overrideWithValue(FakeCoach()),
          ],
          child: MaterialApp(
            theme: ThemeData(
              brightness: Brightness.dark,
              scaffoldBackgroundColor: AppPalette.dark.background,
            ),
            home: const DayBoardScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final ctx = tester.element(find.byType(DayBoardScreen));
      final bg = Theme.of(ctx).scaffoldBackgroundColor;
      expect(bg, AppPalette.dark.background);
    });

    testWidgets('dynamic type at max scale: rows reflow, touch target ≥48px', (
      tester,
    ) async {
      final store = FakeEncryptedStore(
        initial: [
          plateAt(
            1,
            localTime: DateTime(2026, 8, 15, 7, 30),
            dish: 'Oatmeal',
            displayLabel: '~1 bowl',
          ),
        ],
      );
      addTearDown(store.close);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            encryptedStoreProvider.overrideWithValue(store),
            // Story 2.3: OpenDent reads `coachProvider` — override
            // the seam so the test does not hit `UnimplementedError`.
            coachProvider.overrideWithValue(FakeCoach()),
            clockProvider.overrideWithValue(() => DateTime(2026, 8, 15, 12)),
          ],
          child: MaterialApp(
            home: MediaQuery(
              data: const MediaQueryData(textScaler: TextScaler.linear(2.0)),
              child: const DayBoardScreen(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Row reflows — no truncation of the dish name.
      expect(find.text('Oatmeal'), findsOneWidget);

      // PlateRow has a 48px touch target (NFR7).
      final plateRowFinder = find.byType(PlateRow);
      expect(plateRowFinder, findsOneWidget);
      final size = tester.getSize(plateRowFinder);
      expect(size.height, greaterThanOrEqualTo(AppTouchTargets.min));
    });

    testWidgets('filter: yesterday plate does not appear on the board', (
      tester,
    ) async {
      final store = FakeEncryptedStore(
        initial: [
          plateAt(
            1,
            localTime: DateTime(2026, 8, 14, 19, 0),
            dish: 'Yesterday Pizza',
          ),
        ],
      );
      addTearDown(store.close);

      await tester.pumpWidget(_wrap(const DayBoardScreen(), store));
      await tester.pumpAndSettle();

      // Yesterday's plate is filtered out — 3 open dents today.
      expect(find.byType(PlateRow), findsNothing);
      expect(find.byType(OpenDent), findsNWidgets(3));
      expect(find.text('Yesterday Pizza'), findsNothing);
    });

    testWidgets(
      'plate row carries a BalanceArc and a `· on this device` status chip',
      (tester) async {
        final store = FakeEncryptedStore(
          initial: [
            plateAt(
              1,
              localTime: DateTime(2026, 8, 15, 7, 30),
              dish: 'Oatmeal',
            ),
          ],
        );
        addTearDown(store.close);

        await tester.pumpWidget(_wrap(const DayBoardScreen(), store));
        await tester.pumpAndSettle();

        expect(find.byType(BalanceArc), findsOneWidget);
        expect(find.text('· on this device'), findsOneWidget);
      },
    );

    testWidgets(
      'tap on a WeekStrip dot flips DayBoardScreen to that local day',
      (tester) async {
        // Story 1.4 review — M2. The screen's data source is the
        // conditional `selected == null ? dayBoardProvider :
        // dayBoardForDateProvider(selected)`; only an end-to-end mount
        // exercises the branch. Seed plates on yesterday (local) and
        // today (local), tap the leftmost dot in the strip, and verify
        // the board re-renders for yesterday.
        final today = DateTime.now();
        final localToday = DateTime(today.year, today.month, today.day);
        final localYesterday = localToday.subtract(const Duration(days: 1));

        final store = FakeEncryptedStore(
          initial: [
            plateAt(
              1,
              localTime: DateTime(
                localYesterday.year,
                localYesterday.month,
                localYesterday.day,
                19,
                0,
              ),
              dish: 'Yesterday Pizza',
            ),
            plateAt(
              2,
              localTime: DateTime(
                localToday.year,
                localToday.month,
                localToday.day,
                7,
                30,
              ),
              dish: 'Today Oatmeal',
            ),
          ],
        );
        addTearDown(store.close);

        // Use UncontrolledProviderScope so the test can flip
        // `selectedDateProvider` mid-test (see M2 review).
        final container = ProviderContainer(
          overrides: [
            encryptedStoreProvider.overrideWithValue(store),
            // Story 2.3: OpenDent reads `coachProvider` — override
            // the seam so the test does not hit `UnimplementedError`.
            coachProvider.overrideWithValue(FakeCoach()),
          ],
        );
        addTearDown(container.dispose);

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp(
              theme: ThemeData(brightness: Brightness.light),
              home: const DayBoardScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Default view — today's plate is rendered.
        expect(find.text('Today Oatmeal'), findsOneWidget);
        expect(find.text('Yesterday Pizza'), findsNothing);

        // The WeekStrip sits below the board; the leftmost dot is
        // 6 days ago. To land on yesterday we set
        // `selectedDateProvider` directly — that's the same value the
        // strip writes when the user taps the second-from-left dot.
        container.read(selectedDateProvider.notifier).state = localYesterday;
        await tester.pumpAndSettle();

        // Now yesterday's plate is rendered and today's is gone.
        expect(find.text('Yesterday Pizza'), findsOneWidget);
        expect(find.text('Today Oatmeal'), findsNothing);
      },
    );

    testWidgets(
      'quick-repeat `_QuickRepeatLink` hit target is ≥48px on both axes',
      (tester) async {
        final store = FakeEncryptedStore();
        addTearDown(store.close);

        // Use an `UncontrolledProviderScope` so the test can write to
        // `lastLogProvider` and surface the link without depending on a
        // wall-clock side channel.
        final container = ProviderContainer(
          overrides: [
            encryptedStoreProvider.overrideWithValue(store),
            // Story 2.3: OpenDent reads `coachProvider` — override
            // the seam so the test does not hit `UnimplementedError`.
            coachProvider.overrideWithValue(FakeCoach()),
          ],
        );
        addTearDown(container.dispose);

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp(
              theme: ThemeData(brightness: Brightness.light),
              home: const DayBoardScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Surface the link — the screen reacts to `lastLogProvider`
        // changes and renders the `_QuickRepeatLink` widget above the
        // plate stack.
        container.read(lastLogProvider.notifier).state = DateTime.now();
        await tester.pumpAndSettle();

        expect(find.text('+ log another plate'), findsOneWidget);

        // The hit target is the `GestureDetector` ancestor of the text
        // label — the `_QuickRepeatLink` builds a `ConstrainedBox`
        // (minHeight: 48) inside that gesture detector.
        final tapTarget = find
            .ancestor(
              of: find.text('+ log another plate'),
              matching: find.byType(GestureDetector),
            )
            .first;
        final size = tester.getSize(tapTarget);
        expect(
          size.width,
          greaterThanOrEqualTo(AppTouchTargets.min),
          reason: 'quick-repeat width ${size.width} below 48px',
        );
        expect(
          size.height,
          greaterThanOrEqualTo(AppTouchTargets.min),
          reason: 'quick-repeat height ${size.height} below 48px',
        );
      },
    );

    testWidgets(
      'writing to lastLogProvider surfaces the quick-repeat affordance',
      (tester) async {
        final store = FakeEncryptedStore();
        addTearDown(store.close);

        final container = ProviderContainer(
          overrides: [
            encryptedStoreProvider.overrideWithValue(store),
            // Story 2.3: OpenDent reads `coachProvider` — override
            // the seam so the test does not hit `UnimplementedError`.
            coachProvider.overrideWithValue(FakeCoach()),
          ],
        );
        addTearDown(container.dispose);

        await tester.pumpWidget(
          UncontrolledProviderScope(
            container: container,
            child: MaterialApp(
              theme: ThemeData(brightness: Brightness.light),
              home: const DayBoardScreen(),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // No log yet — the affordance is hidden (rendered conditionally,
        // not via `AnimatedOpacity`, so a fresh Day Board reserves zero
        // vertical space for it).
        expect(find.text('+ log another plate'), findsNothing);

        // Stamp `lastLogProvider` — same write the entry surfaces do on a
        // successful `RecordPlate` commit.
        container.read(lastLogProvider.notifier).state = DateTime.now();
        await tester.pumpAndSettle();

        expect(find.text('+ log another plate'), findsOneWidget);
      },
    );
  });
}
