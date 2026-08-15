// Mono `· local` status chip (UX-DR6).
//
// Tiny mono text on the row's trailing edge — never louder than the row
// body (epic-1-context.md § Status chips). The chip is the only base
// state v1 ships; `· pending` and `· synced` arrive with Epic 4.
//
// Touch-target contract: the chip lives inside a tappable row, so the
// row itself owns the 48px hit target. The chip itself is `Opacity`-
// only (no surface) and never a separate button — it is a status marker,
// not an affordance.

import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

class StatusChip extends StatelessWidget {
  const StatusChip({
    super.key,
    this.label = '· local',
  });

  final String label;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;

    return Semantics(
      label: 'Status: $label',
      readOnly: true,
      child: Text(
        label,
        style: AppTypography.monoWhisper.copyWith(
          color: palette.statusLocal,
        ),
      ),
    );
  }
}
