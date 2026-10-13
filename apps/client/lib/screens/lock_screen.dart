// Web-rung lock screen wrapper (Story 4.1 / AD-8).
//
// Renders the `LockScreenBody` against the `WebSessionKey` provider
// graph. The body is the production copy; the wrapper wires the
// unlock probe to the public `webUnlockProbeProvider` so the gate
// actually opens the schema with the derived key. The production
// `main.dart` overrides that provider with the bundle's
// `WasmEncryptedStore.tryOpen`.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../state/web_session_key_provider.dart';
import '../state/web_unlock_probe_provider.dart';
import '../theme/app_tokens.dart';

class LockScreen extends ConsumerWidget {
  const LockScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final sessionKey = ref.watch(webSessionKeyProvider);
    final probe = ref.read(webUnlockProbeProvider);
    return Scaffold(
      backgroundColor: palette.background,
      body: SafeArea(
        child: LockScreenBody(
          sessionKey: sessionKey,
          palette: LockScreenPalette(ink: palette.ink, muted: palette.inkMuted),
          onTryUnlock: (key, passphrase) async {
            final ok = await key.unlock(
              passphrase: passphrase,
              probe: (derived) => probe(derived),
            );
            return ok;
          },
        ),
      ),
    );
  }
}
