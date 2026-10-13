// `UnlockGate` transitions (Phase 2B / W4, W6): create -> board, locked ->
// board -> lock -> restart, reset surface, activity + lifecycle feeding the
// auto-lock, and the no-controller (mobile / dev) path.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:ai_nutrition_coach/screens/about_notice_screen.dart';
import 'package:ai_nutrition_coach/screens/create_passphrase_screen.dart';
import 'package:ai_nutrition_coach/screens/day_board_screen.dart';
import 'package:ai_nutrition_coach/screens/key_lost_screen.dart';
import 'package:ai_nutrition_coach/screens/lock_screen.dart';
import 'package:ai_nutrition_coach/state/erase_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';
import 'package:ai_nutrition_coach/state/web_store_controller_provider.dart';
import 'package:ai_nutrition_coach/widgets/about_gate.dart';
import 'package:ai_nutrition_coach/widgets/unlock_gate.dart';
import 'package:ai_nutrition_coach/widgets/web_lock_button.dart';

import '../_fakes/fake_encrypted_store.dart';
import '../_fakes/fake_web_store_controller.dart';
import '../_fakes/test_overrides.dart';

Future<int Function()> _pump(
  WidgetTester tester,
  FakeWebStoreController? controller, {
  StoreFailure? startupFailure,
}) async {
  var restarts = 0;
  await tester.pumpWidget(
    ProviderScope(
      overrides: withCoachProviders(
        overrides: [
          encryptedStoreProvider.overrideWithValue(FakeEncryptedStore()),
          webStoreControllerProvider.overrideWithValue(controller),
          appRestartProvider.overrideWithValue(() => restarts++),
          storeStartupFailureProvider.overrideWithValue(startupFailure),
        ],
      ),
      child: const MaterialApp(home: UnlockGate()),
    ),
  );
  await tester.pump();
  return () => restarts;
}

/// The web first run shows the one-time "About this app" notice before the
/// passphrase screen (PV1).
Future<void> _dismissAbout(WidgetTester tester) async {
  expect(find.byType(AboutNoticeScreen), findsOneWidget);
  await tester.tap(find.text('Got it'));
  await tester.pumpAndSettle();
}

void main() {
  setUp(resetAboutNoticeSessionFlag);

  testWidgets('first run shows create-passphrase; creating switches to the '
      'Day Board', (tester) async {
    final c = FakeWebStoreController(
      status: WebStoreStatus.needsPassphraseCreation,
    );
    await _pump(tester, c);
    await _dismissAbout(tester);
    expect(find.byType(CreatePassphraseScreen), findsOneWidget);
    expect(find.byType(DayBoardScreen), findsNothing);

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'a long enough passphrase');
    await tester.enterText(fields.at(1), 'a long enough passphrase');
    await tester.tap(find.text(enWebSessionStrings.createAction));
    await tester.pumpAndSettle();

    expect(c.createCalls, ['a long enough passphrase']);
    expect(find.byType(DayBoardScreen), findsOneWidget);
    expect(find.byType(CreatePassphraseScreen), findsNothing);
  });

  testWidgets('every unlock restarts the scope so the AI settings and BYOK '
      'key are read from the now-open encrypted store (ADR-0003)', (
    tester,
  ) async {
    final c = FakeWebStoreController(
      status: WebStoreStatus.needsPassphraseCreation,
    );
    final restarts = await _pump(tester, c);
    await _dismissAbout(tester);
    expect(restarts(), 0);

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'a long enough passphrase');
    await tester.enterText(fields.at(1), 'a long enough passphrase');
    await tester.tap(find.text(enWebSessionStrings.createAction));
    await tester.pumpAndSettle();
    expect(restarts(), 1, reason: 'creating = first unlock');

    // A lock restarts too (the pre-existing behaviour)...
    c.setStatus(WebStoreStatus.locked);
    await tester.pumpAndSettle();
    expect(restarts(), 2, reason: 'the lock restart');
  });

  testWidgets('a returning unlock restarts the scope as well', (tester) async {
    final c = FakeWebStoreController(); // locked
    final restarts = await _pump(tester, c);
    expect(restarts(), 0);
    await tester.enterText(find.byType(TextField), 'a long enough passphrase');
    await tester.tap(find.text(enWebSessionStrings.unlock));
    await tester.pumpAndSettle();
    expect(restarts(), 1);
    expect(find.byType(DayBoardScreen), findsOneWidget);
  });

  testWidgets('returning user: locked -> unlock -> board; wrong passphrase '
      'stays on the lock screen', (tester) async {
    final c = FakeWebStoreController();
    await _pump(tester, c);
    expect(find.byType(LockScreen), findsOneWidget);

    c.next = const WebWrongPassphrase();
    await tester.enterText(find.byType(TextField), 'nope');
    await tester.tap(find.text(enWebSessionStrings.unlock));
    await tester.pumpAndSettle();
    expect(find.byType(LockScreen), findsOneWidget);
    expect(find.text(enWebSessionStrings.wrongPassphrase), findsOneWidget);

    c.next = const WebUnlocked();
    await tester.enterText(find.byType(TextField), 'right');
    await tester.tap(find.text(enWebSessionStrings.unlock));
    await tester.pumpAndSettle();
    expect(find.byType(DayBoardScreen), findsOneWidget);
    expect(find.byType(LockScreen), findsNothing);
  });

  testWidgets('manual Lock from the board locks and restarts the app so no '
      'decrypted provider state survives', (tester) async {
    final c = FakeWebStoreController(status: WebStoreStatus.unlocked);
    final restarts = await _pump(tester, c);
    expect(find.byType(DayBoardScreen), findsOneWidget);
    expect(find.byType(WebLockButton), findsOneWidget);

    await tester.tap(find.text(enWebSessionStrings.lockAction));
    await tester.pumpAndSettle();

    expect(c.lockCalls, 1);
    expect(restarts(), 1);
  });

  testWidgets('an auto-lock (status flips without a tap) also restarts', (
    tester,
  ) async {
    final c = FakeWebStoreController(status: WebStoreStatus.unlocked);
    final restarts = await _pump(tester, c);
    c.setStatus(WebStoreStatus.locked);
    await tester.pumpAndSettle();
    expect(restarts(), 1);
  });

  testWidgets('pointer activity and page lifecycle feed the auto-lock', (
    tester,
  ) async {
    final c = FakeWebStoreController(status: WebStoreStatus.unlocked);
    await _pump(tester, c);
    await tester.tapAt(const Offset(10, 300));
    await tester.pump();
    expect(c.touches, greaterThan(0));

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    expect(c.hidden, 1);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    expect(c.visible, 1);
  });

  testWidgets('needsReset shows the erase-and-start-over surface', (
    tester,
  ) async {
    final c = FakeWebStoreController(status: WebStoreStatus.needsReset);
    await _pump(tester, c);
    expect(find.byType(KeyLostScreen), findsOneWidget);
    expect(find.text(enWebStoreUnreadableStrings.title), findsOneWidget);
  });

  testWidgets('checking / erasing paint nothing sensitive', (tester) async {
    final c = FakeWebStoreController(status: WebStoreStatus.checking);
    await _pump(tester, c);
    expect(find.byType(DayBoardScreen), findsNothing);
    expect(find.byType(LockScreen), findsNothing);
    c.setStatus(WebStoreStatus.erasing);
    await tester.pump();
    expect(find.byType(DayBoardScreen), findsNothing);
  });

  testWidgets('no controller (mobile / dev in-memory): straight to the Day '
      'Board, no lock button', (tester) async {
    await _pump(tester, null);
    expect(find.byType(DayBoardScreen), findsOneWidget);
    expect(find.text(enWebSessionStrings.lockAction), findsNothing);
  });

  testWidgets('no controller but a startup failure: the key-lost surface', (
    tester,
  ) async {
    await _pump(
      tester,
      null,
      startupFailure: const StoreFailure(encryptedStoreError: KeyLostFailure()),
    );
    expect(find.byType(KeyLostScreen), findsOneWidget);
  });
}
