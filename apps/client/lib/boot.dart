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

import 'dart:async';

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
import 'state/privacy_provider.dart';
import 'state/pwa_provider.dart';
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
    this.createAppUpdateSignal = _defaultAppUpdateSignal,
    this.createStoragePersistence = _defaultStoragePersistence,
    this.createInstallPrompt = _defaultInstallPrompt,
    this.readInstallContext = _defaultInstallContext,
    this.purgePickerFiles = _defaultPurgePickerFiles,
    this.photoCapture = const ImagePickerPhotoCapture(),
    this.cameraPermission = const PermissionHandlerCameraPermission(),
    this.overrides = const <Override>[],
  });

  /// Opens the encrypted stores (native SQLite or the web store).
  final Future<StoreBundle> Function() createStores;

  /// Where AI settings are persisted. Receives the encrypted store's
  /// key/value table (web: the settings live in it; mobile ignores it and
  /// uses the OS keystore).
  final AiSettingsStore Function(LocalKeyValueStore? encryptedKv)
  createAiSettingsStore;

  /// Where the BYOK key lives (OS keystore on mobile; the encrypted store on
  /// web).
  final ByokKeyStore Function(LocalKeyValueStore? encryptedKv)
  createByokKeyStore;

  /// The hosted-tier quota counter.
  final QuotaCounter Function() createQuotaCounter;

  /// Drop localStorage-backed secrets an older web build left behind.
  final bool purgeLegacyWebStorage;

  /// The service-worker update signal (web release builds only).
  final AppUpdateSignal Function() createAppUpdateSignal;

  /// Durable-storage status / request (`navigator.storage`).
  final StoragePersistenceSource Function() createStoragePersistence;

  /// The captured Chromium install prompt.
  final InstallPrompt Function() createInstallPrompt;

  /// Platform + installed-or-not, for the Install screen.
  final InstallContext Function() readInstallContext;

  /// Start-up clean-up of plate photos `image_picker` left in the cache
  /// (PV3). Tests pass a recorder.
  final Future<void> Function() purgePickerFiles;

  final PhotoCapture photoCapture;
  final CameraPermission cameraPermission;

  /// Applied LAST: tests replace individual seams (the AI rung, the clock)
  /// on top of the real wiring.
  final List<Override> overrides;
}

Future<StoreBundle> _defaultCreateStores() => createStores();
Future<void> _defaultPurgePickerFiles() async {
  await purgeStalePickerFiles();
}

AiSettingsStore _defaultAiSettingsStore(LocalKeyValueStore? kv) =>
    createAiSettingsStore(encryptedKv: kv);
ByokKeyStore _defaultByokKeyStore(LocalKeyValueStore? kv) =>
    createByokKeyStore(encryptedKv: kv);
AppUpdateSignal _defaultAppUpdateSignal() => createAppUpdateSignal();
StoragePersistenceSource _defaultStoragePersistence() =>
    createStoragePersistence();
InstallPrompt _defaultInstallPrompt() => createInstallPrompt();
InstallContext _defaultInstallContext() => readInstallContext();
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
  // (secure storage on mobile; on web a row of the ENCRYPTED store, so they
  // are readable only after the passphrase unlock — ADR-0003). Hydrate once
  // here; after that `aiSettingsProvider` is the single mutable source, so a
  // change in Settings → Your AI takes effect on the next photo.
  //
  // There is NO build-time API key (S1): only the non-secret endpoint /
  // model defaults may pre-fill the Your AI form. The key is typed at run
  // time and lives in `createByokKeyStore()` — the OS keystore on mobile,
  // the encrypted store on web. On web this function runs again after every
  // unlock (the gate restarts the scope), which is what reads them from the
  // freshly opened database; while the store is locked they read as the
  // no-AI default / no key.
  // Web: drop anything an older build left in localStorage-backed secure
  // storage (best effort; no-op on mobile).
  if (dependencies.purgeLegacyWebStorage) {
    await purgeLegacyWebSecureStorage();
  }
  final aiSettingsStore = dependencies.createAiSettingsStore(
    bundle.keyValueStore,
  );
  final aiSettings = await aiSettingsStore.read();
  final byokKeyStore = dependencies.createByokKeyStore(bundle.keyValueStore);

  // PV3: plate photos the picker left in the cache by an earlier session
  // (older than an hour, so one being taken right now is safe). Best effort.
  unawaited(dependencies.purgePickerFiles().catchError((Object _) {}));

  // PV1 / PV7: the one-time privacy answers live in the encrypted key/value
  // table (an in-memory stand-in for the unencrypted dev web store).
  final privacyPrefs = PrivacyPrefs(
    bundle.keyValueStore ?? InMemoryKeyValueStore(),
  );

  // PWA seams (ADR-0003). The web store is open only when the user has just
  // unlocked it: that is the moment to ask the browser to protect the data
  // from automatic clean-up (once, and only when it is not already
  // protected — never a repeated prompt).
  final storagePersistence = dependencies.createStoragePersistence();
  if (bundle.webStoreController?.isUnlocked ?? false) {
    unawaited(_requestDurableStorage(storagePersistence));
  }

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
    privacyPrefsProvider.overrideWithValue(privacyPrefs),
    // PV7: a barcode leaves the device only after the person said OK to the
    // one-time Open Food Facts notice; "Don't look up online" (or never
    // having been asked) keeps it offline.
    foodCatalogProvider.overrideWithValue(
      OfflineFirstFoodCatalog(
        onlineLookupAllowed: () async =>
            await privacyPrefs.offLookupChoice() == OffLookupChoice.allowed,
      ),
    ),
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
    // Story 3.3 — the BYOK key store: OS keystore on mobile, the encrypted
    // store on web (S4, ADR-0003).
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
    appUpdateProvider.overrideWithValue(dependencies.createAppUpdateSignal()),
    storagePersistenceProvider.overrideWithValue(storagePersistence),
    installPromptProvider.overrideWithValue(dependencies.createInstallPrompt()),
    installContextProvider.overrideWithValue(dependencies.readInstallContext()),
    exportHistoryProvider.overrideWithValue(
      ExportHistory(bundle.keyValueStore ?? InMemoryKeyValueStore()),
    ),
    ...dependencies.overrides,
  ];
}

Future<void> _requestDurableStorage(StoragePersistenceSource source) async {
  try {
    if (await source.status() == StoragePersistence.notProtected) {
      await source.request();
    }
  } on Object {
    // Best effort: the Your data screen reports the real state.
  }
}
