// `OpenPlateHint` widget — the open-plate whisper anchor (FR5 /
// UX-DR5).
//
// Renders inside an `OpenDent` row on the Day Board when the active
// `Coach` port returns a non-empty `openPlate` question for the
// dent's pattern. Serif italic + sage accent (UX-DR5: no `[sure]` /
// `[ask later]` on this surface — tapping the hint records the
// interaction and clears the hint).
//
// The widget is quiet: no spinner, no countdown, no badge. Tapping
// fires the `onTap` callback the parent wires to
// `RecordCoachInteraction(kind: dismiss)` (the open-plate hint
// records a dismissal on tap — there is no follow-up note on this
// surface; the user has chosen to engage with the dent).

import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

class OpenPlateHint extends StatelessWidget {
  const OpenPlateHint({
    super.key,
    required this.question,
    this.onTap,
  });

  /// The verbatim copy the active `Coach` rung resolved for the
  /// `(openPlate, pattern)` pair. Plain text only — no decorative
  /// unicode, no color tokens (NFR7).
  final String question;

  /// Tapped hint — the parent records the `dismiss` interaction
  /// and clears the hint. `null` disables the tap target.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final motion = MediaQuery.of(context).accessibleNavigation ||
        MediaQuery.of(context).disableAnimations;
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: 'Open plate hint: $question',
      child: motion
          ? _buildBody(palette)
          : AnimatedOpacity(
              opacity: 1.0,
              duration: const Duration(milliseconds: 220),
              child: _buildBody(palette),
            ),
    );
  }

  Widget _buildBody(AppPalette palette) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: AppTouchTargets.min),
        child: Padding(
          padding: const EdgeInsets.only(
            top: AppSpacing.xxs,
            left: AppSpacing.lg,
            right: AppSpacing.xs,
            bottom: AppSpacing.xs,
          ),
          child: Text(
            question,
            style: AppTypography.coach.copyWith(color: palette.sage),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    );
  }
}
