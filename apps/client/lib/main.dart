import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import 'screens/day_board_screen.dart';
import 'state/coach_note_provider.dart';
import 'state/coach_provider.dart';
import 'state/manual_entry_provider.dart';
import 'state/photo_provider.dart';
import 'state/record_plate_provider.dart';
import 'state/scanner_adapters.dart';
import 'state/scanner_provider.dart';
import 'theme/app_tokens.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
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
        // Story 1.8 — wire the photo seam. `image_picker` is the
        // only photo-capture dependency in the repo; it lives here
        // (and only here) — `packages/integrations` and
        // `packages/domain_core` never import it (AD-1 grep test
        // pins the rule). The v1 active rung is `NoopAiRung` so the
        // photo path exercises the closest-matches + manual fallback
        // (NFR5 / AD-5).
        aiRungProvider.overrideWithValue(const NoopAiRung()),
        photoCaptureProvider
            .overrideWithValue(const ImagePickerPhotoCapture()),
        // Story 2.1 — wire the coach seam. `TemplateCoach` is the
        // v1 active rung; it resolves the `en` key store at
        // `packages/integrations/lib/src/l10n/coach_strings.dart`
        // (AD-7 / NFR3). An AI-backed rung (Epic 3+) drops in
        // behind the same `Coach` port without touching Stories
        // 2.2 / 2.3 (AD-5).
        coachProvider.overrideWithValue(const TemplateCoach()),
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
      home: const _Scaffold(),
    );
  }
}

class _Scaffold extends StatelessWidget {
  const _Scaffold();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: DayBoardScreen(),
    );
  }
}
