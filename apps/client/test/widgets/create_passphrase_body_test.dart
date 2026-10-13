// First-run create-passphrase surface (Phase 2B / W6): enter + confirm, the
// strength floor, the unrecoverability warning up front, fields cleared.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:ai_nutrition_coach/widgets/create_passphrase_body.dart';
import 'package:ai_nutrition_coach/widgets/lock_screen_body.dart'
    show LockScreenPalette;

Future<void> _pump(
  WidgetTester tester,
  Future<WebUnlockOutcome> Function(String) onCreate,
) async {
  tester.view.physicalSize = const Size(800, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: CreatePassphraseBody(
          palette: const LockScreenPalette(
            ink: Colors.black,
            muted: Colors.grey,
          ),
          onCreate: onCreate,
        ),
      ),
    ),
  );
}

Future<void> _fillAndSubmit(
  WidgetTester tester,
  String first,
  String second,
) async {
  final fields = find.byType(TextField);
  await tester.enterText(fields.at(0), first);
  await tester.enterText(fields.at(1), second);
  await tester.tap(find.text(enWebSessionStrings.createAction));
  await tester.pumpAndSettle();
}

void main() {
  const copy = enWebSessionStrings;

  testWidgets('warns that a forgotten passphrase cannot be recovered', (
    tester,
  ) async {
    await _pump(tester, (_) async => const WebUnlocked());
    expect(find.text(copy.createWarning), findsOneWidget);
    expect(find.textContaining('cannot be recovered'), findsOneWidget);
  });

  testWidgets('too short / mismatch never reach the controller', (
    tester,
  ) async {
    var calls = 0;
    await _pump(tester, (_) async {
      calls++;
      return const WebUnlocked();
    });
    await _fillAndSubmit(tester, 'short', 'short');
    expect(find.text(copy.tooShort), findsOneWidget);
    await _fillAndSubmit(
      tester,
      'a long enough passphrase',
      'a long enough passphras',
    );
    expect(find.text(copy.mismatch), findsOneWidget);
    await _fillAndSubmit(tester, 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa');
    expect(find.text(copy.tooRepetitive), findsOneWidget);
    expect(calls, 0);
  });

  testWidgets('a matching strong passphrase is submitted once and both '
      'fields are cleared', (tester) async {
    final received = <String>[];
    await _pump(tester, (p) async {
      received.add(p);
      return const WebUnlocked();
    });
    await _fillAndSubmit(
      tester,
      'a long enough passphrase',
      'a long enough passphrase',
    );
    expect(received, ['a long enough passphrase']);
    for (final f in tester.widgetList<TextField>(find.byType(TextField))) {
      expect(f.controller!.text, isEmpty);
    }
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('an unavailable store is reported honestly', (tester) async {
    await _pump(tester, (_) async => const WebStoreUnavailable());
    await _fillAndSubmit(
      tester,
      'a long enough passphrase',
      'a long enough passphrase',
    );
    expect(find.text(copy.unavailable), findsOneWidget);
  });
}
