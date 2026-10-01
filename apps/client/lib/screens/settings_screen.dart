// Settings — the one calm list behind the Day Board's app-bar action
// (Phase 3 / F5). Three rows, no cards, hairline rules (UX-DR3):
//
//   Your AI    -> `YourAiScreen`   (rung, key, endpoint, consent)
//   Your data  -> `YourDataScreen` (export, lock, erase)
//   About      -> `AboutScreen`
//
// The Your AI row's subtitle is the live rung label, so changing the rung
// is visible the moment the user comes back. Copy is keyed in
// `SettingsStrings` (AD-7).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart';

import '../state/ai_rung_provider.dart';
import '../theme/app_tokens.dart';
import 'about_screen.dart';
import 'your_ai_screen.dart';
import 'your_data_screen.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key, this.copy = enSettingsStrings});

  final SettingsStrings copy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final kind = ref.watch(aiRungConfigProvider).kind;
    final aiSubtitle = kind == AiRungKind.byok
        ? copy.yourAiByok
        : copy.yourAiNone;

    void open(Widget screen) => Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => screen));

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
        child: ListView(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          children: [
            _row(
              palette,
              title: copy.yourAi,
              subtitle: aiSubtitle,
              onTap: () => open(const YourAiScreen()),
            ),
            _row(
              palette,
              title: copy.yourData,
              subtitle: copy.yourDataSubtitle,
              onTap: () => open(const YourDataScreen()),
            ),
            _row(
              palette,
              title: copy.about,
              subtitle: copy.aboutSubtitle,
              onTap: () => open(const AboutScreen()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(
    AppPalette palette, {
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Column(
      children: [
        Semantics(
          button: true,
          label: '$title, $subtitle',
          excludeSemantics: true,
          child: InkWell(
            onTap: onTap,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: AppTouchTargets.min),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.lg,
                  vertical: AppSpacing.md,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: AppTypography.ui.copyWith(
                              color: palette.ink,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xxs),
                          Text(
                            subtitle,
                            style: AppTypography.mono.copyWith(
                              color: palette.inkMuted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right, color: palette.inkMuted),
                  ],
                ),
              ),
            ),
          ),
        ),
        const Divider(height: AppSpacing.hairline),
      ],
    );
  }
}
