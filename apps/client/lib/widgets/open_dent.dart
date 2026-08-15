// An "open dent" — the quiet place a meal row will fill when it's logged
// (UX-DR10).
//
// Mono copy, no spinner, no countdown, no streak, no CTA. The literal
// "An open, quiet place." string is the spec-approved copy and must
// not be paraphrased.

import 'package:flutter/material.dart';

import '../state/day_board_provider.dart';
import '../theme/app_tokens.dart';

class OpenDent extends StatelessWidget {
  const OpenDent({super.key, required this.slot});

  final MealSlot slot;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;

    return Semantics(
      container: true,
      label: '${slot.label} is open. An open, quiet place.',
      child: Padding(
        padding: const EdgeInsets.symmetric(
          vertical: AppSpacing.sm,
          horizontal: AppSpacing.xs,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            SizedBox(
              width: 44,
              child: Text(
                '—',
                style: AppTypography.mono.copyWith(color: palette.inkMuted),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    slot.label,
                    style: AppTypography.ui.copyWith(color: palette.inkMuted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'An open, quiet place.',
                    style: AppTypography.monoWhisper.copyWith(
                      color: palette.inkMuted,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
