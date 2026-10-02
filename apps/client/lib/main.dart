import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:integrations/integrations.dart';

import 'boot.dart';
import 'l10n/l10n.dart';
import 'state/font_licenses.dart';
import 'state/scanner_adapters.dart';
import 'theme/app_theme.dart';
import 'widgets/unlock_gate.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Story 5.1 / FR-13 — the v1 surface is strictly adults-only. The
  // enforcement is the static check (tools/check_adults_only.dart) and the
  // named-reviewer gate (Story 5.3); there is deliberately no runtime guard
  // pretending to check it (security review F9).
  configureWebBarcodeReader();
  registerBundledFontLicenses();
  runApp(const OpenPlateBootstrap());
}

/// Builds the stores and the provider overrides, and rebuilds them from
/// scratch on request (Phase 2A review 8): after "Erase all local data"
/// succeeds the old database handle is closed and its files are gone, so
/// the app must not keep running on it. `appRestartProvider` hands the
/// restart callback to the screens; calling it discards the whole
/// `ProviderScope` and re-runs `createStores()` — a first-run state.
class OpenPlateBootstrap extends StatefulWidget {
  const OpenPlateBootstrap({
    super.key,
    this.dependencies = const BootDependencies(),
  });

  /// The platform pieces the provider wiring is built on (`boot.dart`).
  /// Production passes nothing; tests inject a temporary database and
  /// in-memory secret stores and boot the REAL wiring on top.
  final BootDependencies dependencies;

  @override
  State<OpenPlateBootstrap> createState() => _OpenPlateBootstrapState();
}

class _OpenPlateBootstrapState extends State<OpenPlateBootstrap> {
  int _generation = 0;
  late Future<List<Override>> _overrides = _boot();

  Future<List<Override>> _boot() =>
      buildAppOverrides(_restart, dependencies: widget.dependencies);

  void _restart() {
    if (!mounted) return;
    setState(() {
      _generation++;
      _overrides = _boot();
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

class OpenPlateApp extends StatelessWidget {
  const OpenPlateApp({super.key, this.themeMode = ThemeMode.system});

  /// `themeMode` is exposed so widget tests can pin light or dark
  /// independently of the platform brightness. Production callers leave it
  /// at the default (`ThemeMode.system`) so the app follows the device.
  final ThemeMode themeMode;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      onGenerateTitle: (context) => context.l10n.appName,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      debugShowCheckedModeBanner: false,
      themeMode: themeMode,
      theme: buildAppTheme(Brightness.light),
      darkTheme: buildAppTheme(Brightness.dark),
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
    return Material(
      color: const Color(0xFFB3261E),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 12),
          child: Center(
            child: Text(
              context.l10n.devStoreBanner,
              style: const TextStyle(color: Colors.white, fontSize: 12),
            ),
          ),
        ),
      ),
    );
  }
}
