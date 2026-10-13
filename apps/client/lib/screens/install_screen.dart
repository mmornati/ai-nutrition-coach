// Settings → Install on your phone (ADR-0003, docs/pwa.md).
//
// Calm, factual install help for the web app: the steps for the platform the
// browser reports first, the other platforms below, what installing changes
// (offline, own icon, Safari's storage treatment) and the one backup line.
// On Chromium, where the browser can offer installation, a single "Install"
// button opens the browser's own dialog -- only here, only on a tap; the
// prompt is never shown by itself and nothing nags.
//
// Copy is keyed in the ARB files (AD-7). The platform detection and the
// captured `beforeinstallprompt` live behind `installContextProvider` /
// `installPromptProvider`, so the screen is tested with plain fakes.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../l10n/l10n.dart';
import '../state/pwa_provider.dart';
import '../theme/app_tokens.dart';

class InstallScreen extends ConsumerWidget {
  const InstallScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final l10n = context.l10n;
    final installContext = ref.watch(installContextProvider);
    final prompt = ref.watch(installPromptProvider);

    final sections =
        <(InstallPlatform, String, String)>[
          (InstallPlatform.ios, l10n.installIosTitle, l10n.installIosSteps),
          (
            InstallPlatform.android,
            l10n.installAndroidTitle,
            l10n.installAndroidSteps,
          ),
          (
            InstallPlatform.desktop,
            l10n.installDesktopTitle,
            l10n.installDesktopSteps,
          ),
        ]..sort((a, b) {
          // The detected platform first; the rest keep their order.
          final aFirst = a.$1 == installContext.platform ? 0 : 1;
          final bFirst = b.$1 == installContext.platform ? 0 : 1;
          return aFirst.compareTo(bFirst);
        });

    TextStyle body() => AppTypography.coach.copyWith(color: palette.inkMuted);
    TextStyle heading() => AppTypography.ui.copyWith(color: palette.ink);

    return Scaffold(
      backgroundColor: palette.background,
      appBar: AppBar(
        backgroundColor: palette.background,
        elevation: 0,
        title: Text(l10n.installTitle, style: heading()),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.lg,
          ),
          children: [
            Text(l10n.installIntro, style: body()),
            const SizedBox(height: AppSpacing.lg),
            if (installContext.standalone)
              Text(l10n.installAlready, style: body())
            else ...[
              ListenableBuilder(
                listenable: prompt,
                builder: (context, _) {
                  if (!prompt.canPrompt) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.lg),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: SizedBox(
                        height: AppTouchTargets.min,
                        child: OutlinedButton(
                          onPressed: prompt.prompt,
                          child: Text(l10n.installButton),
                        ),
                      ),
                    ),
                  );
                },
              ),
              for (final (_, title, steps) in sections) ...[
                Text(title, style: heading()),
                const SizedBox(height: AppSpacing.xs),
                Text(steps, style: body()),
                const SizedBox(height: AppSpacing.lg),
              ],
            ],
            const Divider(height: AppSpacing.hairline),
            const SizedBox(height: AppSpacing.lg),
            Text(l10n.installChangesTitle, style: heading()),
            const SizedBox(height: AppSpacing.xs),
            for (final line in [
              l10n.installChangesOffline,
              l10n.installChangesIcon,
              l10n.installChangesStorage,
            ]) ...[
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: Text(line, style: body()),
              ),
            ],
            const SizedBox(height: AppSpacing.sm),
            Text(l10n.installBackupNote, style: body()),
          ],
        ),
      ),
    );
  }
}
