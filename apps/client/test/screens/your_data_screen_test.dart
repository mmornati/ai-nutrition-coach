// Settings → Your data sub-screen pin (Story 4.1 / AD-8).
//
// The screen's only static content in Story 4.1 is the AD-8
// honest-copy anchor — the protection posture line. The
// "session-sealed, not at-rest encrypted" claim must land on the
// locked-web path; the unlocked line must land on mobile / open
// web. Stories 4.2 / 4.3 will append the export + sync surfaces
// below this line.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:openplate_client/screens/your_data_screen.dart';
import 'package:openplate_client/state/web_session_key_provider.dart';
import 'package:openplate_client/theme/app_tokens.dart';

void main() {
  group('YourDataScreen', () {
    testWidgets(
      'renders the AD-8 locked-protection line when the web session '
      'is locked',
      (tester) async {
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              // A fresh `WebSessionKey` is locked by default.
              webSessionKeyProvider.overrideWithValue(WebSessionKey()),
            ],
            child: const MaterialApp(
              home: YourDataScreen(),
            ),
          ),
        );
        expect(
          find.textContaining('Session-sealed', findRichText: true),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'renders the unlocked protection line on mobile / open web',
      (tester) async {
        final key = WebSessionKey();
        // Manually flip to open by running the unlock probe path
        // with a no-op probe; the simplest path is to call
        // `unlock` with a probe that returns true. The salt is
        // generated internally, so the first call's derive is
        // not asserted — we just need `isOpen` to flip.
        await key.unlock(
          passphrase: 'test',
          probe: (derived) async => true,
        );
        expect(key.isOpen, isTrue);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              webSessionKeyProvider.overrideWithValue(key),
            ],
            child: const MaterialApp(
              home: YourDataScreen(),
            ),
          ),
        );
        expect(
          find.textContaining('Encrypted at rest on mobile',
              findRichText: true),
          findsOneWidget,
        );
      },
    );

    testWidgets(
      'renders the title keyed in YourDataStrings',
      (tester) async {
        await tester.pumpWidget(
          ProviderScope(
            child: const MaterialApp(
              home: YourDataScreen(),
            ),
          ),
        );
        expect(find.text('Your data'), findsOneWidget);
      },
    );

    // Re-export `AppPalette` from the test so the analyzer is
    // happy when the test runner imports this file in isolation.
    test('app palette token surface is reachable', () {
      expect(AppPalette.light.background, isA<Color>());
      expect(AppPalette.dark.background, isA<Color>());
    });
  });
}
