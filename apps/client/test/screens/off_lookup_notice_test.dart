// The one-time Open Food Facts notice (privacy audit PV7), through the
// barcode screen: shown before the FIRST online lookup, never again once
// answered; "Don't look up online" is kept and stops the lookup.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:ai_nutrition_coach/l10n/l10n.dart';
import 'package:ai_nutrition_coach/screens/capture_barcode_screen.dart';
import 'package:ai_nutrition_coach/screens/privacy_screen.dart';
import 'package:ai_nutrition_coach/state/ai_rung_provider.dart';
import 'package:ai_nutrition_coach/state/ai_settings_provider.dart';
import 'package:ai_nutrition_coach/state/coach_note_provider.dart';
import 'package:ai_nutrition_coach/state/coach_provider.dart';
import 'package:ai_nutrition_coach/state/manual_entry_provider.dart';
import 'package:ai_nutrition_coach/state/privacy_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';
import 'package:ai_nutrition_coach/state/scanner_provider.dart';

import '../_fakes/fake_encrypted_store.dart';

/// The REAL catalog with the REAL gate, over a recording OFF source, so what
/// is asserted is what would (not) go on the wire.
class _CountingOff implements OffBarcodeSource {
  final List<String> looked = [];
  @override
  Future<OffBarcodeResult> lookup(String barcode) async {
    looked.add(barcode);
    return OffBarcodeNotFound(barcode);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<({FakeBarcodeScanner scanner, _CountingOff off, PrivacyPrefs prefs})>
_pump(WidgetTester tester, PrivacyPrefs prefs) async {
  final scanner = FakeBarcodeScanner();
  final off = _CountingOff();
  final catalog = OfflineFirstFoodCatalog(
    offSource: off,
    onlineLookupAllowed: () async =>
        await prefs.offLookupChoice() == OffLookupChoice.allowed,
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        encryptedStoreProvider.overrideWithValue(FakeEncryptedStore()),
        foodCatalogProvider.overrideWithValue(catalog),
        barcodeScannerProvider.overrideWithValue(scanner),
        cameraPermissionProvider.overrideWithValue(FakeCameraPermission()),
        barcodeDetectorAvailableProvider.overrideWithValue(true),
        coachProvider.overrideWithValue(FakeCoach()),
        coachNoteStoreProvider.overrideWithValue(FakeCoachNoteStore()),
        privacyPrefsProvider.overrideWithValue(prefs),
        initialAiSettingsProvider.overrideWithValue(AiSettings.defaults),
        aiSettingsStoreProvider.overrideWithValue(InMemoryAiSettingsStore()),
        byokKeyStoreProvider.overrideWithValue(InMemoryByokKeyStore()),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: const CaptureBarcodeScreen(),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 100));
  return (scanner: scanner, off: off, prefs: prefs);
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  testWidgets('first scan: the notice appears BEFORE anything is sent; OK '
      'allows the lookup and is remembered', (tester) async {
    final kv = InMemoryKeyValueStore();
    final w = await _pump(tester, PrivacyPrefs(kv));

    w.scanner.emit('3017620422003');
    await _settle(tester);
    expect(find.text('Barcode lookups'), findsOneWidget);
    expect(
      find.text(
        'Barcodes you scan are looked up on Open Food Facts (public, no '
        'account). Only the barcode is sent.',
      ),
      findsOneWidget,
    );
    expect(w.off.looked, isEmpty, reason: 'nothing leaves before OK');

    await tester.tap(find.text('OK'));
    await _settle(tester);
    expect(w.off.looked, ['3017620422003']);
    expect(await w.prefs.offLookupChoice(), OffLookupChoice.allowed);
  });

  testWidgets('"Don\'t look up online" sends nothing, is remembered, and the '
      'notice does not come back', (tester) async {
    final kv = InMemoryKeyValueStore();
    final w = await _pump(tester, PrivacyPrefs(kv));

    w.scanner.emit('3017620422003');
    await _settle(tester);
    await tester.tap(find.text('Don’t look up online'));
    await _settle(tester);

    expect(w.off.looked, isEmpty);
    expect(await w.prefs.offLookupChoice(), OffLookupChoice.offlineOnly);
    // The manual path is offered (not found offline).
    expect(find.text('Type it manually'), findsWidgets);

    // A second scan: no notice, still nothing sent.
    await tester.tap(find.text('Type it manually').first);
    await _settle(tester);
  });

  testWidgets('already answered: no notice; "allowed" looks up, "offline '
      'only" never does', (tester) async {
    final allowed = PrivacyPrefs(InMemoryKeyValueStore());
    await allowed.setOffLookupChoice(OffLookupChoice.allowed);
    final a = await _pump(tester, allowed);
    a.scanner.emit('111');
    await _settle(tester);
    expect(find.text('Barcode lookups'), findsNothing);
    expect(a.off.looked, ['111']);

    await tester.pumpWidget(const SizedBox());
    final offline = PrivacyPrefs(InMemoryKeyValueStore());
    await offline.setOffLookupChoice(OffLookupChoice.offlineOnly);
    final b = await _pump(tester, offline);
    b.scanner.emit('222');
    await _settle(tester);
    expect(find.text('Barcode lookups'), findsNothing);
    expect(b.off.looked, isEmpty);
  });

  testWidgets('the notice links to the in-app privacy page', (tester) async {
    final w = await _pump(tester, PrivacyPrefs(InMemoryKeyValueStore()));
    w.scanner.emit('3017620422003');
    await _settle(tester);
    await tester.tap(find.text('What this app stores and sends'));
    await _settle(tester);
    expect(find.byType(PrivacyScreen), findsOneWidget);
    expect(w.off.looked, isEmpty);
  });
}
