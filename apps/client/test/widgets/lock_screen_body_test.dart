// `LockScreenBody` error mapping: an unsupported web store (this build has
// none yet) must be reported honestly and NOT blamed on the passphrase.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:openplate_client/widgets/lock_screen_body.dart';

Future<void> _submit(
  WidgetTester tester,
  Future<bool> Function(WebSessionKey, String) onTryUnlock,
) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: LockScreenBody(
          sessionKey: WebSessionKey(),
          palette: const LockScreenPalette(
            ink: Colors.black,
            muted: Colors.grey,
          ),
          onTryUnlock: onTryUnlock,
        ),
      ),
    ),
  );
  await tester.enterText(find.byType(TextField), 'a passphrase');
  await tester.tap(find.text(enWebSessionStrings.unlock));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('unsupported store shows the honest unavailable line', (
    tester,
  ) async {
    await _submit(
      tester,
      (_, _) async => throw UnsupportedError('no web store'),
    );
    expect(find.text(enWebSessionStrings.unavailable), findsOneWidget);
    expect(find.text(enWebSessionStrings.wrongPassphrase), findsNothing);
  });

  testWidgets('a refused probe still shows the wrong-passphrase line', (
    tester,
  ) async {
    await _submit(tester, (_, _) async => false);
    expect(find.text(enWebSessionStrings.wrongPassphrase), findsOneWidget);
    expect(find.text(enWebSessionStrings.unavailable), findsNothing);
  });
}
