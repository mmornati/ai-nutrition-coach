// Settings → Your data sub-screen pin (Story 4.1 / AD-8, Phase 2B).
//
// The screen's static content is the AD-8 honest-copy anchor — the
// protection posture line. The web-locked line must land when the web
// store is locked; the unlocked line (cipher named truthfully, key
// handling per platform) on mobile / open web. Stories 4.2 / 4.3 will append the export + sync surfaces
// below this line.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:openplate_client/screens/your_data_screen.dart';
import 'package:openplate_client/state/erase_provider.dart';
import 'package:openplate_client/state/web_store_controller_provider.dart';
import 'package:openplate_client/theme/app_tokens.dart';

import '../_fakes/fake_web_store_controller.dart';

class _RecordingEraser implements LocalDataEraser {
  _RecordingEraser(this.result);
  final EraseLocalDataResult result;
  int calls = 0;

  @override
  Future<EraseLocalDataResult> eraseAll() async {
    calls++;
    return result;
  }
}

void main() {
  group('YourDataScreen', () {
    testWidgets('renders the AD-8 locked-protection line when the web store '
        'is locked', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            webStoreControllerProvider.overrideWithValue(
              FakeWebStoreController(),
            ),
          ],
          child: const MaterialApp(home: YourDataScreen()),
        ),
      );
      expect(
        find.textContaining(
          'Encrypted at rest in this browser',
          findRichText: true,
        ),
        findsOneWidget,
      );
      expect(
        find.textContaining('Session-sealed', findRichText: true),
        findsNothing,
      );
    });

    testWidgets('renders the unlocked protection line on mobile / open web', (
      tester,
    ) async {
      final c = FakeWebStoreController(status: WebStoreStatus.unlocked);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [webStoreControllerProvider.overrideWithValue(c)],
          child: const MaterialApp(home: YourDataScreen()),
        ),
      );
      expect(
        find.textContaining('Encrypted at rest (', findRichText: true),
        findsOneWidget,
      );
      // The unrecoverable-passphrase fact is stated plainly.
      expect(
        find.textContaining('cannot be recovered', findRichText: true),
        findsOneWidget,
      );
    });

    testWidgets('renders the title keyed in YourDataStrings', (tester) async {
      await tester.pumpWidget(
        ProviderScope(child: const MaterialApp(home: YourDataScreen())),
      );
      expect(find.text('Your data'), findsOneWidget);
    });

    testWidgets('copy names the real cipher, not AES-256', (tester) async {
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: YourDataScreen())),
      );
      expect(
        find.textContaining('ChaCha20-Poly1305', findRichText: true),
        findsOneWidget,
      );
      expect(find.textContaining('AES', findRichText: true), findsNothing);
    });

    testWidgets('web unlocked: lock control and idle delay choice; the delay '
        'is applied to the controller', (tester) async {
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final c = FakeWebStoreController(status: WebStoreStatus.unlocked);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [webStoreControllerProvider.overrideWithValue(c)],
          child: const MaterialApp(home: YourDataScreen()),
        ),
      );
      expect(find.text(enWebSessionStrings.lockAfterLabel), findsOneWidget);
      await tester.tap(find.text('30 minutes'));
      await tester.pump();
      expect(c.idleTimeout, const Duration(minutes: 30));
      await tester.tap(find.text(enWebSessionStrings.lockAction));
      await tester.pump();
      expect(c.lockCalls, 1);
    });

    testWidgets('mobile / no controller: no lock controls', (tester) async {
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        const ProviderScope(child: MaterialApp(home: YourDataScreen())),
      );
      expect(find.text(enWebSessionStrings.lockAfterLabel), findsNothing);
      expect(find.text(enWebSessionStrings.lockAction), findsNothing);
    });

    group('Erase all local data (Phase 2A / D8)', () {
      Future<_RecordingEraser> pump(
        WidgetTester tester,
        EraseLocalDataResult result,
      ) async {
        // Tall surface so the whole list (export + erase) is built.
        tester.view.physicalSize = const Size(800, 3000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final eraser = _RecordingEraser(result);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [localDataEraserProvider.overrideWithValue(eraser)],
            child: const MaterialApp(home: YourDataScreen()),
          ),
        );
        return eraser;
      }

      testWidgets('cancelling the confirmation erases nothing', (tester) async {
        final eraser = await pump(tester, const EraseLocalDataSuccess());
        await tester.tap(find.text('Erase all local data'));
        await tester.pumpAndSettle();
        expect(find.text('Erase everything on this device?'), findsOneWidget);
        await tester.tap(find.text('Keep my data'));
        await tester.pumpAndSettle();
        expect(eraser.calls, 0);
        expect(find.textContaining('All local data was erased'), findsNothing);
      });

      testWidgets('confirming runs the use case and shows the calm line', (
        tester,
      ) async {
        final eraser = await pump(tester, const EraseLocalDataSuccess());
        await tester.tap(find.text('Erase all local data'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Erase'));
        await tester.pumpAndSettle();
        expect(eraser.calls, 1);
        expect(
          find.textContaining('All local data was erased'),
          findsOneWidget,
        );
      });

      testWidgets('a failed erase is reported honestly', (tester) async {
        await pump(tester, EraseLocalDataFailure([EraseStep.secureStorage]));
        await tester.tap(find.text('Erase all local data'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Erase'));
        await tester.pumpAndSettle();
        expect(find.textContaining('could not be erased'), findsOneWidget);
      });
    });

    // Re-export `AppPalette` from the test so the analyzer is
    // happy when the test runner imports this file in isolation.
    test('app palette token surface is reachable', () {
      expect(AppPalette.light.background, isA<Color>());
      expect(AppPalette.dark.background, isA<Color>());
    });
  });
}
