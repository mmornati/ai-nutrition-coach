import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import 'screens/day_board_screen.dart';
import 'state/manual_entry_provider.dart';
import 'state/record_plate_provider.dart';
import 'theme/app_tokens.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = await createEncryptedStore();
  runApp(
    ProviderScope(
      overrides: [
        encryptedStoreProvider.overrideWithValue(store),
        // Story 1.5 — wire the manual-entry + voice seams. The catalog
        // is offline-first; the voice transcriber is a no-op (FR3 /
        // FR13). Both are swapped out behind the same port shapes when
        // Epic 3+ ships real adapters.
        foodCatalogProvider
            .overrideWithValue(OfflineFirstFoodCatalog()),
        voiceTranscriberProvider
            .overrideWithValue(const NoopVoiceTranscriber()),
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
