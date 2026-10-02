// Shared harness for the accessibility guideline suite (NFR-7 / NFR-8 /
// UX-DR-13). `tools/check_accessibility_floor.dart` requires every screen
// under `lib/screens/` to be exercised through `expectMeetsAllGuidelines`
// here, which asserts Flutter's own four guidelines against the rendered
// semantics tree - tap target size (Android 48dp, iOS 44pt), labelled tap
// targets, and text contrast - in BOTH the light and the dark theme.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openplate_client/l10n/l10n.dart';
import 'package:openplate_client/theme/app_theme.dart';

/// A phone-wide, TALL surface (400 x 2400 logical px at 2x).
///
/// Flutter's guidelines SKIP nodes that are off screen (`accessibility.dart`:
/// tap-target and contrast checks drop nodes that are hidden or "too far off
/// screen"), so anything below the fold of a normal phone would silently go
/// unmeasured. Every screen is therefore laid out on a surface tall enough to
/// show all of its content at once.
void usePhoneSurface(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 4800);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
}

/// Wraps [home] in a `MaterialApp` using the production theme.
Widget themedApp(Widget home, {Brightness brightness = Brightness.light}) {
  return MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    theme: buildAppTheme(Brightness.light),
    darkTheme: buildAppTheme(Brightness.dark),
    themeMode: brightness == Brightness.dark ? ThemeMode.dark : ThemeMode.light,
    home: home,
  );
}

/// Asserts the four Flutter accessibility guidelines on whatever is on
/// screen right now. [reason] names the screen / state for the failure.
Future<void> expectMeetsAllGuidelines(
  WidgetTester tester,
  String reason,
) async {
  final handle = tester.ensureSemantics();
  try {
    await expectLater(
      tester,
      meetsGuideline(androidTapTargetGuideline),
      reason: '$reason: Android tap target (48dp)',
    );
    await expectLater(
      tester,
      meetsGuideline(iOSTapTargetGuideline),
      reason: '$reason: iOS tap target (44pt)',
    );
    await expectLater(
      tester,
      meetsGuideline(labeledTapTargetGuideline),
      reason: '$reason: labeled tap targets',
    );
    await expectLater(
      tester,
      meetsGuideline(textContrastGuideline),
      reason: '$reason: text contrast',
    );
  } finally {
    handle.dispose();
  }
}

/// Runs [body] once per brightness so each screen is checked in light and
/// dark. The `pump` callback pumps the app for the given brightness.
void a11yTest(
  String description,
  Future<void> Function(
    WidgetTester tester,
    Future<void> Function(Widget Function(Brightness) build) pump,
    Brightness brightness,
  )
  body,
) {
  for (final brightness in Brightness.values) {
    testWidgets('$description [${brightness.name}]', (tester) async {
      usePhoneSurface(tester);
      await body(
        tester,
        (build) => tester.pumpWidget(build(brightness)),
        brightness,
      );
    });
  }
}
