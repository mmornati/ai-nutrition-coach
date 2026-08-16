import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import 'state/ai_rung_provider.dart';
import 'state/coach_note_provider.dart';
import 'state/coach_provider.dart';
import 'state/manual_entry_provider.dart';
import 'state/photo_provider.dart';
import 'state/record_plate_provider.dart';
import 'state/scanner_adapters.dart';
import 'state/scanner_provider.dart';
import 'state/web_session_key_provider.dart';
import 'state/web_unlock_probe_provider.dart';
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
  final bundle = await createStores();
  runApp(
    ProviderScope(
      overrides: [
        encryptedStoreProvider.overrideWithValue(bundle.encryptedStore),
        // Story 2.2 — wire the coach-note store against the same
        // encrypted database the plate-log store writes to (AD-3
        // invariant: one store, no second source). The
        // `CoachNoteGenerator` is constructed from
        // `coachNoteGeneratorProvider` (in `coach_note_provider.dart`)
        // and `RecordPlate` reads it through
        // `recordPlateProvider` after this override is in scope.
        coachNoteStoreProvider.overrideWithValue(bundle.coachNoteStore),
        // Story 1.5 — wire the manual-entry + voice seams. The catalog
        // is offline-first; the voice transcriber is a no-op (FR3 /
        // FR13). Both are swapped out behind the same port shapes when
        // Epic 3+ ships real adapters.
        foodCatalogProvider
            .overrideWithValue(OfflineFirstFoodCatalog()),
        voiceTranscriberProvider
            .overrideWithValue(const NoopVoiceTranscriber()),
        // Story 1.7 — wire the barcode seam. `mobile_scanner` is the
        // only camera dependency; `permission_handler` is the
        // cross-platform permission surface (NFR7). Both are wrapped
        // behind the `BarcodeScanner` / `CameraPermission` ports so
        // tests can substitute fakes without touching the camera.
        barcodeScannerProvider.overrideWithValue(
          MobileScannerBarcodeScanner(),
        ),
        cameraPermissionProvider.overrideWithValue(
          const PermissionHandlerCameraPermission(),
        ),
        // Story 3.1 — wire the AI rung config. The v1 default is
        // `AiRungKind.noOp` (Story 1.8 carry-over); `aiRungProvider`
        // reads the config and returns the matching adapter. The
        // provider graph compiles against all four kinds
        // (`noOp | hostedQuota | byok | local`) so Stories 3.2 /
        // 3.3 can flip the config without touching the screen.
        aiRungConfigProvider.overrideWithValue(
          const AiRungConfig(kind: AiRungKind.noOp),
        ),
        photoCaptureProvider
            .overrideWithValue(const ImagePickerPhotoCapture()),
        // Story 2.1 — wire the coach seam. `TemplateCoach` is the
        // v1 active rung; it resolves the `en` key store at
        // `packages/integrations/lib/src/l10n/coach_strings.dart`
        // (AD-7 / NFR3). An AI-backed rung (Epic 3+) drops in
        // behind the same `Coach` port without touching Stories
        // 2.2 / 2.3 (AD-5).
        coachProvider.overrideWithValue(const TemplateCoach()),
        // Story 4.1 — wire the web session key + the unlock probe.
        // Both are only populated on the web bundle (Story 4.1
        // added the optional fields to `StoreBundle` for exactly
        // this wiring). On io the lock screen never renders (the
        // `UnlockGate` is `kIsWeb`-aware), so the providers fall
        // back to the throw-on-unoverridden defaults — which are
        // unreachable.
        if (bundle.webSessionKey != null)
          webSessionKeyProvider
              .overrideWithValue(bundle.webSessionKey!),
        if (bundle.webUnlockProbe != null)
          webUnlockProbeProvider
              .overrideWithValue(bundle.webUnlockProbe!),
      ],
      child: const OpenPlateApp(),
    ),
  );
}

class OpenPlateApp extends StatelessWidget {
  const OpenPlateApp({super.key, this.themeMode = ThemeMode.system});

  /// `themeMode` is exposed so widget tests can pin light or dark
  /// independently of the platform brightness. Production callers leave it
  /// at the default (`ThemeMode.system`) so the app follows the device.
  final ThemeMode themeMode;

  @override
  Widget build(BuildContext context) {
    final light = AppPalette.light;
    final dark = AppPalette.dark;
    return MaterialApp(
      title: 'OpenPlate',
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
      home: const UnlockGate(),
    );
  }
}
