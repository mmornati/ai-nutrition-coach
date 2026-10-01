// The Settings → About sub-screen (Story 5.2 / FR-14 / OQ-4 / AD-7).
//
// Renders the v2 managed-oversight notice line ("Family oversight
// is a v2 seam — not in v1") plus the project's open-source
// footmark. The sub-screen is the only place the v2 seam is
// surfaced in v1; the copy is keyed in `ManagedOversightStrings`
// (in `coach_strings.dart`) and never interpolated.
//
// AD-7: copy is keyed; named NDP reviewer signs off. The single
// line is plain "not in v1" — never "coming soon", never a
// countdown (FR-15 ban list).

import 'package:flutter/material.dart';
import 'package:integrations/integrations.dart';

import '../theme/app_tokens.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key, this.copy = enManagedOversightStrings});

  final ManagedOversightStrings copy;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    return Scaffold(
      backgroundColor: palette.background,
      appBar: AppBar(
        backgroundColor: palette.background,
        elevation: 0,
        title: Text(
          'About',
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
                copy.v2Notice,
                style: AppTypography.coach.copyWith(color: palette.inkMuted),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(
                'yours to run · open source',
                style: AppTypography.mono.copyWith(color: palette.inkMuted),
              ),
              const SizedBox(height: AppSpacing.lg),
              TextButton(
                style: TextButton.styleFrom(
                  minimumSize: const Size.fromHeight(AppTouchTargets.min),
                  alignment: Alignment.centerLeft,
                ),
                onPressed: () => showLicensePage(
                  context: context,
                  applicationName: 'OpenPlate',
                ),
                child: Text(
                  'Open-source licences',
                  style: AppTypography.ui.copyWith(color: palette.ink),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
