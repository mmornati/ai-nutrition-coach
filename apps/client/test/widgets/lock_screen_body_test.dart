// `LockScreenBody` behaviour (Phase 2B / W4, W7): every outcome maps to its
// own calm line, the busy spinner is ALWAYS released, the field is cleared
// after every attempt, and the forgot-passphrase disclosure states the
// unrecoverability.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:ai_nutrition_coach/widgets/lock_screen_body.dart';

Future<void> _pump(
  WidgetTester tester,
  Future<WebUnlockOutcome> Function(String) onUnlock, {
  Future<String?> Function()? onForgot,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: LockScreenBody(
          palette: const LockScreenPalette(
            ink: Colors.black,
            muted: Colors.grey,
          ),
          onUnlock: onUnlock,
          onForgot: onForgot,
        ),
      ),
    ),
  );
}

Future<void> _submit(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(TextField), text);
  await tester.tap(find.text(enWebSessionStrings.unlock));
  await tester.pumpAndSettle();
}

String _fieldText(WidgetTester tester) =>
    tester.widget<TextField>(find.byType(TextField)).controller!.text;

void main() {
  const copy = enWebSessionStrings;

  testWidgets('wrong passphrase: calm line, field cleared, button usable', (
    tester,
  ) async {
    await _pump(tester, (_) async => const WebWrongPassphrase());
    await _submit(tester, 'a passphrase');
    expect(find.text(copy.wrongPassphrase), findsOneWidget);
    expect(_fieldText(tester), isEmpty);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    final button = tester.widget<OutlinedButton>(find.byType(OutlinedButton));
    expect(button.onPressed, isNotNull);
  });

  testWidgets('success releases the busy state too (W4 stuck spinner)', (
    tester,
  ) async {
    await _pump(tester, (_) async => const WebUnlocked());
    await _submit(tester, 'a passphrase');
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(_fieldText(tester), isEmpty);
  });

  testWidgets('throttled and unavailable have their own honest lines', (
    tester,
  ) async {
    await _pump(tester, (_) async => const WebThrottled(Duration(seconds: 2)));
    await _submit(tester, 'x');
    expect(find.text(copy.throttled), findsOneWidget);
    expect(find.text(copy.wrongPassphrase), findsNothing);

    await _pump(tester, (_) async => const WebStoreUnavailable());
    await _submit(tester, 'x');
    expect(find.text(copy.unavailable), findsOneWidget);
  });

  testWidgets('open in another tab has its own line and can be retried', (
    tester,
  ) async {
    var calls = 0;
    await _pump(tester, (_) async {
      calls++;
      return calls == 1 ? const WebStoreInUseElsewhere() : const WebUnlocked();
    });
    await _submit(tester, 'x');
    expect(find.text(copy.inOtherTab), findsOneWidget);
    await _submit(tester, 'x');
    expect(find.text(copy.inOtherTab), findsNothing);
    expect(calls, 2);
  });

  testWidgets('data written by a newer version: its own calm line (reload to '
      'update), not "wrong passphrase"', (tester) async {
    await _pump(tester, (_) async => const WebStoreNewerVersion());
    await _submit(tester, 'x');
    expect(find.text(copy.newerVersion), findsOneWidget);
    expect(find.textContaining('reload'), findsOneWidget);
    expect(find.text(copy.wrongPassphrase), findsNothing);
  });

  testWidgets('a thrown error is reported as unavailable, not as a wrong '
      'passphrase, and releases busy', (tester) async {
    await _pump(tester, (_) async => throw StateError('boom'));
    await _submit(tester, 'x');
    expect(find.text(copy.unavailable), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('an empty field is not submitted', (tester) async {
    var calls = 0;
    await _pump(tester, (_) async {
      calls++;
      return const WebUnlocked();
    });
    await tester.tap(find.text(copy.unlock));
    await tester.pumpAndSettle();
    expect(calls, 0);
    expect(find.text(copy.wrongPassphrase), findsOneWidget);
  });

  testWidgets('forgot passphrase states it is unrecoverable and offers the '
      'erase', (tester) async {
    var erased = 0;
    await _pump(
      tester,
      (_) async => const WebUnlocked(),
      onForgot: () async {
        erased++;
        return 'could not erase';
      },
    );
    expect(find.text(copy.forgotBody), findsNothing);
    await tester.tap(find.text(copy.forgot));
    await tester.pumpAndSettle();
    expect(find.textContaining('cannot be recovered'), findsOneWidget);
    await tester.tap(find.text(copy.forgotAction));
    await tester.pumpAndSettle();
    expect(erased, 1);
    expect(find.text('could not erase'), findsOneWidget);
  });

  testWidgets('no forgot affordance without a handler', (tester) async {
    await _pump(tester, (_) async => const WebUnlocked());
    expect(find.text(copy.forgot), findsNothing);
  });
}
