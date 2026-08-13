// Smoke test for the OpenPlate client scaffold.
//
// At story 1.1 this is intentionally small but it actually exercises the
// token wiring: we pump the app twice (ThemeMode.light and ThemeMode.dark)
// and assert the scaffold background color matches the corresponding
// palette entry. If the light/dark switch in `main.dart` ever drifts from
// `AppPalette`, this fails before merge.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:openplate_client/main.dart';
import 'package:openplate_client/theme/app_tokens.dart';

Future<void> _pumpWithMode(
  WidgetTester tester,
  ThemeMode mode,
) async {
  await tester.pumpWidget(
    OpenPlateApp(
      themeMode: mode,
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('OpenPlate scaffold renders and wires light tokens',
      (tester) async {
    await _pumpWithMode(tester, ThemeMode.light);

    expect(find.text('OpenPlate'), findsOneWidget);
    expect(find.byType(MaterialApp), findsOneWidget);

    final ctx = tester.element(find.byType(Scaffold));
    final theme = Theme.of(ctx);
    expect(theme.brightness, Brightness.light);
    expect(theme.scaffoldBackgroundColor, AppPalette.light.background);
  });

  testWidgets('OpenPlate scaffold resolves dark tokens from Theme.of',
      (tester) async {
    await _pumpWithMode(tester, ThemeMode.dark);

    final ctx = tester.element(find.byType(Scaffold));
    final theme = Theme.of(ctx);
    expect(theme.brightness, Brightness.dark);
    expect(theme.scaffoldBackgroundColor, AppPalette.dark.background);
  });

  test('palette exposes both light and dark variants', () {
    expect(AppPalette.light.background, isNot(AppPalette.dark.background));
    expect(AppPalette.light.sage, isNot(AppPalette.dark.sage));
  });

  test('spacing scale is a 4px multiple', () {
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
      expect(s % 4 == 0 || s == 1, isTrue,
          reason: 'spacing value $s is not on the 4px scale');
    }
  });
}
