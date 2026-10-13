// The one-time "About this app" notice (privacy audit PV1).
//
// Shown once, before the first Day Board on mobile and before the passphrase
// is created on the web: AI Nutrition Coach is designed for adults; photo recognition
// is off by default and only ever sends a photo to a service the person
// chooses, after they say yes; plates stay on the device, encrypted. One
// calm "Got it" dismisses it for good (the answer is kept in the encrypted
// store - see `AboutGate`). A link opens the in-app privacy page.
//
// No countdown, no pre-ticked box, no second prompt (NDP standard). Copy is
// in the ARB file (AD-7).

import 'package:flutter/material.dart';

import '../l10n/l10n.dart';
import '../theme/app_tokens.dart';
import 'privacy_screen.dart';

class AboutNoticeScreen extends StatelessWidget {
  const AboutNoticeScreen({super.key, required this.onDismiss});

  /// Called when the person taps "Got it".
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final body = AppTypography.coach.copyWith(color: palette.ink);
    return Scaffold(
      backgroundColor: palette.background,
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    l10n.aboutNoticeTitle,
                    style: AppTypography.ui.copyWith(
                      color: palette.ink,
                      fontSize: 22,
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                Text(l10n.aboutNoticeAdults, style: body),
                const SizedBox(height: AppSpacing.md),
                Text(l10n.aboutNoticeAi, style: body),
                const SizedBox(height: AppSpacing.md),
                Text(l10n.aboutNoticeLocal, style: body),
                const SizedBox(height: AppSpacing.md),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    style: TextButton.styleFrom(
                      minimumSize: const Size(
                        AppTouchTargets.min,
                        AppTouchTargets.min,
                      ),
                      alignment: Alignment.centerLeft,
                    ),
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => const PrivacyScreen(),
                      ),
                    ),
                    child: Text(l10n.privacyLinkLabel),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: onDismiss,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(AppTouchTargets.min),
                      backgroundColor: palette.sageDeep,
                    ),
                    child: Text(
                      l10n.aboutNoticeOk,
                      style: AppTypography.ui.copyWith(
                        color: palette.background,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
