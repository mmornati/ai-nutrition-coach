// Web unlock screen (Story 4.1 / AD-8, Phase 2B).
//
// Wires `LockScreenBody` to the `WebStoreController`: submitting derives the
// key, opens the encrypted database with it (a wrong passphrase is rejected
// by sqlite3mc itself) and flips the gate to the Day Board. The forgotten-
// passphrase path runs the same confirmed erase as "Your data" and then
// restarts the app into the first-run state.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../state/erase_provider.dart';
import '../state/web_store_controller_provider.dart';
import '../theme/app_tokens.dart';
import '../widgets/erase_local_data_dialog.dart';
import '../widgets/lock_screen_body.dart';

class LockScreen extends ConsumerWidget {
  const LockScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final controller = ref.watch(webStoreControllerProvider)!;
    return Scaffold(
      backgroundColor: palette.background,
      body: SafeArea(
        child: LockScreenBody(
          palette: LockScreenPalette(ink: palette.ink, muted: palette.inkMuted),
          onUnlock: controller.unlock,
          onForgot: () async {
            // Resolve everything BEFORE the erase starts: the erase flips the
            // store to `erasing`, the gate replaces this screen, and a
            // disposed widget's `ref` can no longer be read.
            final eraser = ref.read(eraseLocalDataProvider);
            final restart = ref.read(appRestartProvider);
            final result = await confirmAndEraseLocalData(
              context: context,
              erase: () => eraser(),
            );
            switch (result) {
              case null:
                return null;
              case EraseLocalDataSuccess():
                restart();
                return null;
              case EraseLocalDataFailure():
                return enYourDataStrings.eraseFailed;
            }
          },
        ),
      ),
    );
  }
}
