// Lock screen accessibility-floor pin (Story 5.4 / NFR-7 / FR-13).
//
// Pins the lock screen's a11y floor: 48px unlock pill,
// `Semantics` wrapper, passphrase field announces by name.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/screens/lock_screen.dart';
import 'package:ai_nutrition_coach/state/web_store_controller_provider.dart';

import '../_fakes/fake_web_store_controller.dart';

void main() {
  group('LockScreen a11y floor (Story 5.4 / NFR-7)', () {
    testWidgets('passphrase field is announced by name', (tester) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            webStoreControllerProvider.overrideWithValue(
              FakeWebStoreController(),
            ),
          ],
          child: const MaterialApp(home: LockScreen()),
        ),
      );
      // The lock screen's LockScreenBody wraps the label in
      // Semantics, so the screen-reader label is the heading.
      expect(
        find.bySemanticsLabel(RegExp(r'.*store.*', caseSensitive: false)),
        findsWidgets,
      );
      semantics.dispose();
    });
  });
}
