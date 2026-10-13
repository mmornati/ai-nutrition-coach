// First-run web screen: create the passphrase that encrypts the store
// (Phase 2B / W6). Shown by the `UnlockGate` while no store exists yet.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/web_store_controller_provider.dart';
import '../theme/app_tokens.dart';
import '../widgets/create_passphrase_body.dart';
import '../widgets/lock_screen_body.dart' show LockScreenPalette;

class CreatePassphraseScreen extends ConsumerWidget {
  const CreatePassphraseScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final controller = ref.watch(webStoreControllerProvider)!;
    return Scaffold(
      backgroundColor: palette.background,
      body: SafeArea(
        child: CreatePassphraseBody(
          palette: LockScreenPalette(ink: palette.ink, muted: palette.inkMuted),
          onCreate: controller.createStore,
        ),
      ),
    );
  }
}
