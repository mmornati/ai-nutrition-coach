// Settings → Privacy: "What this app stores and sends" (privacy audit §4.5).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:openplate_client/l10n/l10n.dart';
import 'package:openplate_client/screens/privacy_screen.dart';
import 'package:openplate_client/screens/settings_screen.dart';
import 'package:openplate_client/state/ai_rung_provider.dart';
import 'package:openplate_client/state/ai_settings_provider.dart';
import 'package:openplate_client/state/privacy_provider.dart';

import '../_fakes/test_overrides.dart' show privacyPrefsFor;

Widget _app(PrivacyPrefs prefs, Widget home) => ProviderScope(
  overrides: [
    privacyPrefsProvider.overrideWithValue(prefs),
    initialAiSettingsProvider.overrideWithValue(AiSettings.defaults),
    aiSettingsStoreProvider.overrideWithValue(InMemoryAiSettingsStore()),
    byokKeyStoreProvider.overrideWithValue(InMemoryByokKeyStore()),
  ],
  child: MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: home,
  ),
);

void main() {
  setUp(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.views.first.devicePixelRatio = 1.0;
    binding.platformDispatcher.views.first.physicalSize = const Size(800, 3200);
  });
  tearDown(() {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    binding.platformDispatcher.views.first.resetPhysicalSize();
    binding.platformDispatcher.views.first.resetDevicePixelRatio();
  });

  testWidgets('answers what is stored, what leaves, what the server sees, '
      'what is never collected, how to delete and export', (tester) async {
    await tester.pumpWidget(_app(privacyPrefsFor(), const PrivacyScreen()));
    await tester.pumpAndSettle();

    for (final text in [
      'What this app stores and sends',
      'Stored on this device, encrypted',
      'What leaves this device, and when',
      'Scanning a barcode',
      'Open Food Facts',
      'Only the barcode is sent',
      'Recognising a photo',
      'only if you turned on your own AI and say yes',
      'may keep requests under its own policy',
      'What the server you got this app from sees',
      'nothing about you or your plates',
      'Never collected',
      'No analytics, no tracking, no crash reports',
      'no accounts',
      'Deleting your data',
      'press and hold it on the Day Board',
      'Erase all local data',
      'Exporting',
      'plain, unencrypted text files',
      'Shared devices',
    ]) {
      expect(find.textContaining(text), findsWidgets, reason: text);
    }
    // PV4: the Android scanner note is present on Android and says
    // "may" / "not verified" rather than claiming either way.
    expect(find.textContaining('Google ML Kit'), findsOneWidget);
    expect(find.textContaining('have not verified this yet'), findsOneWidget);
  });

  testWidgets('the barcode switch reflects and stores the answer', (
    tester,
  ) async {
    final kv = InMemoryKeyValueStore();
    await tester.pumpWidget(_app(PrivacyPrefs(kv), const PrivacyScreen()));
    await tester.pumpAndSettle();
    expect(
      find.text('You will be asked the first time you scan a barcode.'),
      findsOneWidget,
    );
    expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(await PrivacyPrefs(kv).offLookupChoice(), OffLookupChoice.allowed);
    expect(
      find.text('On: a scanned barcode is looked up online.'),
      findsOneWidget,
    );

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(
      await PrivacyPrefs(kv).offLookupChoice(),
      OffLookupChoice.offlineOnly,
    );
    expect(
      find.textContaining('only the offline catalog is used'),
      findsOneWidget,
    );
  });

  testWidgets('a stored "offline only" answer shows the switch off', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        privacyPrefsFor(off: OffLookupChoice.offlineOnly),
        const PrivacyScreen(),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(find.byType(Switch)).value, isFalse);
    expect(
      find.textContaining('only the offline catalog is used'),
      findsOneWidget,
    );
  });

  testWidgets('Settings lists Privacy and opens the page', (tester) async {
    await tester.pumpWidget(_app(privacyPrefsFor(), const SettingsScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Privacy'), findsOneWidget);
    expect(find.text('what is stored · what is sent'), findsOneWidget);
    await tester.tap(find.text('Privacy'));
    await tester.pumpAndSettle();
    expect(find.byType(PrivacyScreen), findsOneWidget);
  });
}
