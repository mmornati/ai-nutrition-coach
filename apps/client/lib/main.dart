import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:integrations/integrations.dart';

import 'state/ai_rung_provider.dart';
import 'state/ai_settings_provider.dart';
import 'state/coach_note_provider.dart';
import 'state/coach_provider.dart';
import 'state/erase_provider.dart';
import 'state/manual_entry_provider.dart';
import 'state/photo_provider.dart';
import 'state/record_plate_provider.dart';
import 'state/scanner_adapters.dart';
import 'state/scanner_provider.dart';
import 'state/web_store_controller_provider.dart';
import 'theme/app_tokens.dart';
import 'widgets/privacy_guard.dart';
import 'widgets/unlock_gate.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Story 5.1 / FR-13 — assert the v1 surface is strictly
  // adults-only (no biometric import, no under-13 profile
  // machinery). The runtime guard is a safety net; the durable
  // enforcement is the static check (tools/check_adults_only.dart)
  // + the named-reviewer gate (Story 5.3).
  PrivacyGuard.assertAdultsOnly();
  runApp(const OpenPlateBootstrap());
}

/// Builds the stores and the provider overrides, and rebuilds them from
/// scratch on request (Phase 2A review 8): after "Erase all local data"
/// succeeds the old database handle is closed and its files are gone, so
/// the app must not keep running on it. `appRestartProvider` hands the
/// restart callback to the screens; calling it discards the whole
/// `ProviderScope` and re-runs `createStores()` — a first-run state.
class OpenPlateBootstrap extends StatefulWidget {
  const OpenPlateBootstrap({super.key});

  @override
  State<OpenPlateBootstrap> createState() => _OpenPlateBootstrapState();
}

class _OpenPlateBootstrapState extends State<OpenPlateBootstrap> {
  int _generation = 0;
  late Future<List<Override>> _overrides = _bootOverrides(_restart);

  void _restart() {
    if (!mounted) return;
    setState(() {
      _generation++;
      _overrides = _bootOverrides(_restart);
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Override>>(
      key: ValueKey<int>(_generation),
      future: _overrides,
      builder: (context, snapshot) {
        final overrides = snapshot.data;
        if (overrides == null) {
          // Opening the store is quick; paint nothing rather than a
          // spinner that would flash on every launch.
          return const SizedBox.shrink();
        }
        return ProviderScope(
          key: ValueKey<int>(_generation),
          overrides: overrides,
          child: const OpenPlateApp(),
        );
      },
    );
  }
}

Future<List<Override>> _bootOverrides(VoidCallback restart) async {
  final bundle = await createStores();

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
  await purgeLegacyWebSecureStorage();
  final aiSettingsStore = createAiSettingsStore();
  final aiSettings = await aiSettingsStore.read();
  final byokKeyStore = createByokKeyStore();

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
    // tests can substitute fakes without touching the camera.
    barcodeScannerProvider.overrideWithValue(MobileScannerBarcodeScanner()),
    cameraPermissionProvider.overrideWithValue(
      const PermissionHandlerCameraPermission(),
    ),
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
    quotaCounterProvider.overrideWithValue(
      createQuotaCounter(ceiling: kHostedQuotaPerDay),
    ),
    hostedQuotaProviderProvider.overrideWithValue(
      const CloudflareWorkersAiProvider(),
    ),
    photoCaptureProvider.overrideWithValue(const ImagePickerPhotoCapture()),
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
  ];
}

class AiNutritionCoachApp extends StatelessWidget {
  const AiNutritionCoachApp({super.key, this.themeMode = ThemeMode.system});

  /// `themeMode` is exposed so widget tests can pin light or dark
  /// independently of the platform brightness. Production callers leave it
  /// at the default (`ThemeMode.system`) so the app follows the device.
  final ThemeMode themeMode;

  @override
  Widget build(BuildContext context) {
    final light = AppPalette.light;
    final dark = AppPalette.dark;
    return MaterialApp(
      title: 'AI Nutrition Coach',
      debugShowCheckedModeBanner: false,
      themeMode: themeMode,
      theme: ThemeData(
        brightness: Brightness.light,
        scaffoldBackgroundColor: light.background,
        colorScheme: ColorScheme.fromSeed(
          seedColor: light.sage,
          brightness: Brightness.light,
        ),
        textTheme: const TextTheme(
          bodyMedium: AppTypography.ui,
          bodySmall: AppTypography.uiMuted,
          labelSmall: AppTypography.mono,
        ),
      ),
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: dark.background,
        colorScheme: ColorScheme.fromSeed(
          seedColor: dark.sage,
          brightness: Brightness.dark,
        ),
        textTheme: const TextTheme(
          bodyMedium: AppTypography.ui,
          bodySmall: AppTypography.uiMuted,
          labelSmall: AppTypography.mono,
        ),
      ),
      builder: (context, child) {
        if (!const BuildConfig().devInMemoryStore) {
          return child ?? const SizedBox.shrink();
        }
        return Column(
          children: [
            const _DevStoreBanner(),
            Expanded(child: child ?? const SizedBox.shrink()),
          ],
        );
      },
      home: const UnlockGate(),
    );
  }
}

/// Always-visible warning while the dev in-memory web store is active.
class _DevStoreBanner extends StatelessWidget {
  const _DevStoreBanner();

  @override
  Widget build(BuildContext context) {
    return const Material(
      color: Color(0xFFB3261E),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: 4, horizontal: 12),
          child: Center(
            child: Text(
              'DEV — not encrypted. Data lives in memory only.',
              style: TextStyle(color: Colors.white, fontSize: 12),
            ),
          ),
        ),
      ),
    );
  }
}
