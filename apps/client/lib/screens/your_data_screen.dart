// Settings → Your data sub-screen (Story 4.1 shell, AD-8 / FR-9).
//
// The sub-screen is one calm list under Settings; the only static
// content this story ships is the AD-8 honest-copy anchor — the
// protection posture line that says "session-sealed, not at-rest
// encrypted" on web. The export affordance (Story 4.2) and the
// sync status (Story 4.3) fill in below this line.
//
// AD-7: copy is keyed in `YourDataStrings` (in the integrations
// `coach_strings.dart`); never interpolated, named NDP reviewer
// signs off. The single value (`enYourDataStrings`) is the
// canonical, calm, non-judgmental copy.
//
// The screen is web-aware: on `kIsWeb` it reads the
// `webSessionKeyProvider`'s `isOpen` to render the locked /
// unlocked posture. On io the line is the unlocked posture (the
// mobile store is AES-256 at rest via Keychain/Keystore — Story
// 1.2 / AD-8).

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../state/web_session_key_provider.dart';
import '../theme/app_tokens.dart';

class YourDataScreen extends ConsumerWidget {
  const YourDataScreen({super.key, this.copy = enYourDataStrings});

  final YourDataStrings copy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final locked = kIsWeb && !ref.watch(webSessionKeyProvider).isOpen;
    return Scaffold(
      backgroundColor: palette.background,
      appBar: AppBar(
        backgroundColor: palette.background,
        elevation: 0,
        title: Text(
          copy.title,
          style: AppTypography.ui.copyWith(color: palette.ink),
        ),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.lg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                locked ? copy.lockedProtection : copy.unlockedProtection,
                style: AppTypography.coach.copyWith(color: palette.inkMuted),
              ),
              const SizedBox(height: AppSpacing.lg),
              const Divider(height: AppSpacing.hairline),
              const SizedBox(height: AppSpacing.lg),
              // Story 4.2 — export affordance lands here.
              // Story 4.3 — sync status surface lands here.
            ],
          ),
        ),
      ),
    );
  }
}
