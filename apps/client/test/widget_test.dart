// Smoke test for the OpenPlate client scaffold.
//
// At story 1.1 this is intentionally small but it actually exercises the
// token wiring: we pump the app twice (ThemeMode.light and ThemeMode.dark)
// and assert the scaffold background color matches the corresponding
// palette entry. If the light/dark switch in `main.dart` ever drifts from
// `AppPalette`, this fails before merge.
//
// Story 1.2 wraps the app in a `ProviderScope` so the `LogPlateScreen`
// can pull from `encryptedStoreProvider`. We override it with a no-op
// stub here — drift's `watchRecent()` leaves timers pending in test
// scope, so we don't use the real adapter.
//
// Story 1.3 swaps the home to `DayBoardScreen`. The fake store here
// must hold at least one commit so the screen has a Day Board to render;
// an empty store still renders the open-dent state, which is also
// verifiable. We assert the title text + the light/dark token wiring.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:openplate_client/main.dart';
import 'package:openplate_client/screens/day_board_screen.dart';
import 'package:openplate_client/state/record_plate_provider.dart';
import 'package:openplate_client/theme/app_tokens.dart';

import '_fakes/fake_encrypted_store.dart';

class _StubEncryptedStore implements EncryptedStore {
  const _StubEncryptedStore();

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async =>
      RecordPlateSuccess(
        PlateLog(
          id: 0,
          loggedAtUtc: DateTime.utc(2026, 8, 15),
          entries: const <FoodEntry>[],
        ),
      );

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) =>
      const Stream<List<PlateLog>>.empty();

  @override
  Future<void> close() async {}
}

Future<void> _pumpWithMode(
  WidgetTester tester,
  ThemeMode mode,
) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        encryptedStoreProvider.overrideWithValue(const _StubEncryptedStore()),
      ],
      child: OpenPlateApp(themeMode: mode),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('OpenPlate scaffold renders and wires light tokens',
      (tester) async {
    await _pumpWithMode(tester, ThemeMode.light);

    // Story 1.3: home is the Day Board — its title is "Today".
    expect(find.text('Today'), findsOneWidget);
    expect(find.byType(MaterialApp), findsOneWidget);

    // The DayBoardScreen owns its own Scaffold; pick the deepest one.
    final ctx = tester.element(find.byType(DayBoardScreen));
    final theme = Theme.of(ctx);
    expect(theme.brightness, Brightness.light);
    expect(theme.scaffoldBackgroundColor, AppPalette.light.background);
  });

  testWidgets('OpenPlate scaffold resolves dark tokens from Theme.of',
      (tester) async {
    await _pumpWithMode(tester, ThemeMode.dark);

    final ctx = tester.element(find.byType(DayBoardScreen));
    final theme = Theme.of(ctx);
    expect(theme.brightness, Brightness.dark);
    expect(theme.scaffoldBackgroundColor, AppPalette.dark.background);
  });

  test('palette exposes both light and dark variants', () {
    expect(AppPalette.light.background, isNot(AppPalette.dark.background));
    expect(AppPalette.light.sage, isNot(AppPalette.dark.sage));
  });

  test('spacing scale is a 4px multiple', () {
    // 4px scale with `xxs = 2` (a half-step on the 4px scale, kept for
    // hairline-adjacent tweaks) and `hairline = 1` (the row-divider
    // exception).
    const steps = <double>[
      AppSpacing.xxs,
      AppSpacing.xs,
      AppSpacing.sm,
      AppSpacing.md,
      AppSpacing.lg,
      AppSpacing.xl,
      AppSpacing.xxl,
      AppSpacing.xxxl,
    ];
    for (final s in steps) {
      expect(s == 2 || s % 4 == 0, isTrue,
          reason: 'spacing value $s is not on the 4px scale');
    }
  });

  test('FakeEncryptedStore yields seeded plates through watchRecent', () async {
    final today = DateTime(2026, 8, 15, 7, 30);
    final store = FakeEncryptedStore(initial: [
      plateAt(1, localTime: today, dish: 'Oatmeal'),
    ]);

    final plates = await store.watchRecent().first;
    expect(plates, hasLength(1));
    expect(plates.single.entries.single.databaseFood.displayName, 'Oatmeal');
    await store.close();
  });
}
