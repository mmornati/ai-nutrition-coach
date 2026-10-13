// `CoachDepthPanel` widget — the inline depth panel that surfaces on
// `[sure]` (FR5 / UX-DR5 / NFR7 / NFR8).
//
// Layout: serif-italic follow-up question + `[close]` amber-outline
// pill (UX-DR5: never red, never a countdown). ≥48px tap target on
// the pill (NFR7). Reduced-motion collapses the entrance to a fade
// only (NFR8). Color is never the sole signal — the question carries
// the content, the pill carries the action by label.
//
// The panel renders the verbatim text the active `Coach` rung
// resolved for `depthFollowUp` (or `null` when the use-case did not
// produce a follow-up note — calm-degrade path). Tapping `[close]`
// fires the `onClose` callback which records the `depthAnswer`
// interaction and closes the panel. The underlying whisper returns
// to its `[sure]` / `[ask later]` form.

import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';
import '../l10n/l10n.dart';

class CoachDepthPanel extends StatelessWidget {
  const CoachDepthPanel({super.key, required this.question, this.onClose});

  /// The verbatim copy the active `Coach` rung resolved for the
  /// depth follow-up. `null` is the calm-degrade path — the panel
  /// renders an empty surface with the `[close]` pill so the user
  /// can dismiss without seeing a "no follow-up available" message
  /// (UX-DR5: no error UI, no toast).
  final String? question;

  /// Tapped `[close]` — the parent records the `depthAnswer`
  /// interaction through `RecordCoachInteraction` and removes this
  /// panel from the tree. `null` disables the pill (defensive).
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final motion =
        MediaQuery.of(context).accessibleNavigation ||
        MediaQuery.of(context).disableAnimations;
    return Semantics(
      container: true,
      label: context.l10n.coachDepthSemantics(
        question ?? context.l10n.coachDepthNothingToAdd,
      ),
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
    return Padding(
      padding: const EdgeInsets.only(
        top: AppSpacing.xs,
        left: AppSpacing.lg,
        right: AppSpacing.xs,
        bottom: AppSpacing.xs,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (question != null)
            Text(
              question!,
              style: AppTypography.coach.copyWith(
                color: palette.ink,
                height: 1.6,
              ),
            ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [_ClosePill(palette: palette, onTap: onClose)],
          ),
        ],
      ),
    );
  }
}

class _ClosePill extends StatelessWidget {
  const _ClosePill({required this.palette, required this.onTap});

  final AppPalette palette;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: context.l10n.close,
      child: Material(
        color: Colors.transparent,
        shape: StadiumBorder(
          side: BorderSide(color: palette.coach, width: 1.0),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(
              minHeight: AppTouchTargets.min,
              minWidth: AppTouchTargets.min,
            ),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg,
              vertical: AppSpacing.sm,
            ),
            child: Text(
              context.l10n.close,
              style: AppTypography.ui.copyWith(color: palette.coach),
            ),
          ),
        ),
      ),
    );
  }
}
