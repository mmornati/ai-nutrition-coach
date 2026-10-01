// The production provider wiring — ONE function that `main.dart` and the
// tests both use (security review F1 / F5 / 2.9).
//
// It used to live as a private function in `main.dart`, so no test ever
// booted the real `ProviderScope` overrides: a missing or throwing override
// (the photo screen's second `aiRungProvider`, the unreachable Settings, a
// provider nobody overrode) could not be caught. Now `buildAppOverrides` is
// public and parameterised by `BootDependencies`: production passes nothing
// (real secure storage, real camera, real database), a test passes a
// temporary database path and in-memory secret stores and gets the SAME
// wiring on top of them — including the real `EncryptedStoreAdapter` on
// native SQLite.

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:integrations/integrations.dart';

import 'state/ai_rung_provider.dart';
import 'state/ai_settings_provider.dart';
import 'state/barcode_detector_support.dart';
import 'state/coach_note_provider.dart';
import 'state/coach_provider.dart';
import 'state/erase_provider.dart';
import 'state/manual_entry_provider.dart';
import 'state/photo_provider.dart';
import 'state/record_plate_provider.dart';
import 'state/scanner_adapters.dart';
import 'state/scanner_provider.dart';
import 'state/web_store_controller_provider.dart';

/// The platform pieces the wiring is built on. Every field defaults to the
/// production implementation.
class BootDependencies {
  const BootDependencies({
    this.createStores = _defaultCreateStores,
    this.createAiSettingsStore = _defaultAiSettingsStore,
    this.createByokKeyStore = _defaultByokKeyStore,
    this.createQuotaCounter = _defaultQuotaCounter,
    this.purgeLegacyWebStorage = true,
    this.photoCapture = const ImagePickerPhotoCapture(),
    this.cameraPermission = const PermissionHandlerCameraPermission(),
    this.overrides = const <Override>[],
  });

  /// Opens the encrypted stores (native SQLite or the web store).
  final Future<StoreBundle> Function() createStores;

  /// Where AI settings are persisted.
  final AiSettingsStore Function() createAiSettingsStore;

  /// Where the BYOK key lives (OS keystore / memory on web).
  final ByokKeyStore Function() createByokKeyStore;

  /// The hosted-tier quota counter.
  final QuotaCounter Function() createQuotaCounter;

  /// Drop localStorage-backed secrets an older web build left behind.
  final bool purgeLegacyWebStorage;

  final PhotoCapture photoCapture;
  final CameraPermission cameraPermission;

  /// Applied LAST: tests replace individual seams (the AI rung, the clock)
  /// on top of the real wiring.
  final List<Override> overrides;
}

Future<StoreBundle> _defaultCreateStores() => createStores();
AiSettingsStore _defaultAiSettingsStore() => createAiSettingsStore();
ByokKeyStore _defaultByokKeyStore() => createByokKeyStore();
QuotaCounter _defaultQuotaCounter() =>
    createQuotaCounter(ceiling: kHostedQuotaPerDay);

/// Builds the stores and every provider override the app runs on.
/// [restart] discards the whole scope and re-runs this function (after
/// "Erase all local data", and when the web store locks).
Future<List<Override>> buildAppOverrides(
  VoidCallback restart, {
  BootDependencies dependencies = const BootDependencies(),
}) async {
  final bundle = await dependencies.createStores();

  // Phase 3 — AI settings (rung, BYOK endpoint + model, per-host photo
  // consents) are runtime state, persisted by `createAiSettingsStore()`
  // (secure storage on mobile; memory on web, where they live for the
  // unlocked session like the key — S4). Hydrate once here; after that
  // `aiSettingsProvider` is the single mutable source, so a change in
  // Settings → Your AI takes effect on the next photo.
  //
  // There is NO build-time API key (S1): only the non-secret endpoint /
  // model defaults may pre-fill the Your AI form. The key is typed at run
  // time and lives in `createByokKeyStore()` — the OS keystore on mobile,
  // memory only on web (cleared when the web store locks: the lock restarts
  // this ProviderScope, which rebuilds these stores empty).
  // Web: drop anything an older build left in localStorage-backed secure
  // storage (best effort; no-op on mobile).
  if (dependencies.purgeLegacyWebStorage) {
    await purgeLegacyWebSecureStorage();
  }
  final aiSettingsStore = dependencies.createAiSettingsStore();
  final aiSettings = await aiSettingsStore.read();
  final byokKeyStore = dependencies.createByokKeyStore();

  return [
    encryptedStoreProvider.overrideWithValue(bundle.encryptedStore),
    // Story 2.2 — wire the coach-note store against the same
    // encrypted database the plate-log store writes to (AD-3
    // invariant: one store, no second source). The
    // `CoachNoteGenerator` is constructed from
    // `coachNoteGeneratorProvider` (in `coach_note_provider.dart`)
    // and `RecordPlate` reads it through
    // `recordPlateProvider` after this override is in scope.
    coachNoteStoreProvider.overrideWithValue(bundle.coachNoteStore),
    // Phase 2A / D7 + D8 — the startup failure drives the lost-key
    // surface; the eraser holds the bundle's close handle so the
    // database is released before its files are deleted.
    storeStartupFailureProvider.overrideWithValue(bundle.startupFailure),
    localDataEraserProvider.overrideWithValue(
      LocalDataEraserImpl(
        closeDatabase: bundle.closeDatabase,
        eraseStoreData: bundle.eraseStoreData,
      ),
    ),
    // Story 1.5 — wire the manual-entry + voice seams. The catalog
    // is offline-first; the voice transcriber is a no-op (FR3 /
    // FR13). Both are swapped out behind the same port shapes when
    // Epic 3+ ships real adapters.
    foodCatalogProvider.overrideWithValue(OfflineFirstFoodCatalog()),
    voiceTranscriberProvider.overrideWithValue(const NoopVoiceTranscriber()),
    // Story 1.7 — wire the barcode seam. `mobile_scanner` is the
    // only camera dependency; `permission_handler` is the
    // cross-platform permission surface (NFR7). Both are wrapped
    // behind the `BarcodeScanner` / `CameraPermission` ports so
    // tests can substitute fakes without touching the camera. The
    // scanner (and its camera controller) is created on first use and
    // DISPOSED with the scope (F10).
    barcodeScannerProvider.overrideWith((ref) {
      final scanner = MobileScannerBarcodeScanner();
      ref.onDispose(scanner.dispose);
      return scanner;
    }),
    barcodeDetectorAvailableProvider.overrideWithValue(
      barcodeDetectorAvailable(),
    ),
    cameraPermissionProvider.overrideWithValue(dependencies.cameraPermission),
    // Phase 3 — the AI rung is derived from the persisted, runtime-
    // mutable settings (`aiRungConfigProvider` / `aiRungProvider` /
    // the BYOK transport all watch `aiSettingsProvider`).
    initialAiSettingsProvider.overrideWithValue(aiSettings),
    aiSettingsStoreProvider.overrideWithValue(aiSettingsStore),
    // Story 3.3 — the BYOK key store: OS keystore on mobile, memory-only
    // on web (S4).
    byokKeyStoreProvider.overrideWithValue(byokKeyStore),
    // Story 3.2 — the hosted rung's collaborators. The hosted tier is a
    // stub that makes no request and is not selectable (it needs a
    // server-side relay: S5, docs/ai-tiers.md), but the providers are
    // wired so nothing reachable throws when unoverridden.
    quotaCounterProvider.overrideWithValue(dependencies.createQuotaCounter()),
    hostedQuotaProviderProvider.overrideWithValue(
      const CloudflareWorkersAiProvider(),
    ),
    photoCaptureProvider.overrideWithValue(dependencies.photoCapture),
    // Story 2.1 — wire the coach seam. `TemplateCoach` is the
    // v1 active rung; it resolves the `en` key store at
    // `packages/integrations/lib/src/l10n/coach_strings.dart`
    // (AD-7 / NFR3). An AI-backed rung (Epic 3+) drops in
    // behind the same `Coach` port without touching Stories
    // 2.2 / 2.3 (AD-5).
    coachProvider.overrideWithValue(const TemplateCoach()),
    // Phase 2B — the web store controller (create / unlock / lock / erase
    // and the in-memory key). Only the web factory populates it; on io
    // and for the dev in-memory store it is null and the gate goes
    // straight to the Day Board.
    webStoreControllerProvider.overrideWithValue(bundle.webStoreController),
    appRestartProvider.overrideWithValue(restart),
    ...dependencies.overrides,
  ];
}
