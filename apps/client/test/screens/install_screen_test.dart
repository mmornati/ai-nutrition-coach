// Settings → Install on your phone (ADR-0003): platform-first steps, the
// calm Install button only when the browser offered one, what installing
// changes, and the export reminder line.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:ai_nutrition_coach/screens/install_screen.dart';
import 'package:ai_nutrition_coach/state/pwa_provider.dart';

Future<void> _pump(
  WidgetTester tester, {
  InstallPlatform platform = InstallPlatform.desktop,
  bool standalone = false,
  InstallPrompt? prompt,
}) async {
  tester.view.physicalSize = const Size(800, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        installContextProvider.overrideWithValue(
          InstallContext(platform: platform, standalone: standalone),
        ),
        if (prompt != null) installPromptProvider.overrideWithValue(prompt),
      ],
      child: const MaterialApp(home: InstallScreen()),
    ),
  );
}

void main() {
  testWidgets('shows all three platforms and the detected one FIRST', (
    tester,
  ) async {
    await _pump(tester, platform: InstallPlatform.ios);
    expect(find.text('Install on your phone'), findsOneWidget);
    expect(find.textContaining('Add to Home Screen'), findsOneWidget);
    expect(find.textContaining('Install app'), findsOneWidget);
    expect(find.textContaining('install icon'), findsOneWidget);
    final ios = tester.getTopLeft(find.text('iPhone or iPad')).dy;
    final android = tester.getTopLeft(find.text('Android')).dy;
    final desktop = tester.getTopLeft(find.text('Computer')).dy;
    expect(ios, lessThan(android));
    expect(ios, lessThan(desktop));
  });

  testWidgets('Android first on Android', (tester) async {
    await _pump(tester, platform: InstallPlatform.android);
    expect(
      tester.getTopLeft(find.text('Android')).dy,
      lessThan(tester.getTopLeft(find.text('iPhone or iPad')).dy),
    );
  });

  testWidgets('explains what installing changes, incl. the Safari storage '
      'treatment and the export line', (tester) async {
    await _pump(tester);
    expect(find.text('What installing changes'), findsOneWidget);
    expect(find.textContaining('without a connection'), findsWidgets);
    expect(find.textContaining('own icon'), findsOneWidget);
    expect(find.textContaining('Safari may clear'), findsOneWidget);
    expect(find.textContaining('export a copy'), findsOneWidget);
  });

  testWidgets('no Install button unless the browser offered one; tapping it '
      'opens the browser dialog once', (tester) async {
    final prompt = ManualInstallPrompt();
    await _pump(tester, prompt: prompt);
    expect(find.text('Install'), findsNothing);

    prompt.offer();
    await tester.pump();
    expect(find.text('Install'), findsOneWidget);
    await tester.tap(find.text('Install'));
    await tester.pump();
    expect(prompt.prompts, 1);
    expect(find.text('Install'), findsNothing); // used up, not re-offered
  });

  testWidgets('already installed: says so instead of giving instructions', (
    tester,
  ) async {
    await _pump(tester, platform: InstallPlatform.ios, standalone: true);
    expect(
      find.text('AI Nutrition Coach is already installed on this device.'),
      findsOneWidget,
    );
    expect(find.textContaining('Add to Home Screen'), findsNothing);
    expect(find.text('What installing changes'), findsOneWidget);
  });
}
