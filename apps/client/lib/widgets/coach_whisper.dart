// `CoachWhisper` widget — the post-resolve whisper on a plate row
// (UX-DR5 / NFR3 / NFR7 / NFR8 / FR4).
//
// Layout: serif-italic question + `[sure]` sage pill + `[ask later]`
// quiet amber outline pill. Both buttons hit ≥48px on the short axis
// (NFR7). Reduced-motion collapses the entrance to a fade only
// (NFR8). Color is never the sole signal — the buttons carry the
// action by label (`sure` / `ask later`), the text carries the
// question, the color is the affordance only.
//
// Story 2.3 wires the answer / dismiss / depth interaction; this
// widget is intentionally inert — it surfaces the buttons and
// fires the `onSure` / `onAskLater` callbacks, but the callbacks
// themselves (and the follow-up state) ship in Story 2.3.

import 'package:flutter/material.dart';

import '../theme/app_tokens.dart';

class CoachWhisper extends StatelessWidget {
  const CoachWhisper({
    super.key,
    required this.question,
    this.onSure,
    this.onAskLater,
  });

  /// The verbatim copy the active `Coach` rung resolved. Plain text
  /// only — no decorative unicode, no color tokens (NFR7).
  final String question;

  /// Tapped `[sure]` — Story 2.3 wires this to the depth-answer
  /// surface. `null` disables the button (the v1 whisper still
  /// surfaces the affordance; Story 2.3 fills in the action).
  final VoidCallback? onSure;

  /// Tapped `[ask later]` — Story 2.3 wires this to the ask-later
  /// transition (no nag, no streak, no score). `null` disables the
  /// button.
  final VoidCallback? onAskLater;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    // NFR8: reduced-motion collapses the entrance to a fade only.
    final motion = MediaQuery.of(context).accessibleNavigation ||
        MediaQuery.of(context).disableAnimations;
    return Semantics(
      container: true,
      label: 'Coach question: $question',
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
      padding: const EdgeInsets.symmetric(
        vertical: AppSpacing.xs,
        horizontal: AppSpacing.xs,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            question,
            style: AppTypography.coach.copyWith(
              color: palette.ink,
              height: 1.6,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              _SurePill(
                palette: palette,
                onTap: onSure,
              ),
              const SizedBox(width: AppSpacing.sm),
              _AskLaterPill(
                palette: palette,
                onTap: onAskLater,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SurePill extends StatelessWidget {
  const _SurePill({required this.palette, required this.onTap});

  final AppPalette palette;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: 'sure',
      child: Material(
        color: palette.sage,
        shape: const StadiumBorder(),
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
              'sure',
              style: AppTypography.ui.copyWith(
                color: palette.background,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AskLaterPill extends StatelessWidget {
  const _AskLaterPill({required this.palette, required this.onTap});

  final AppPalette palette;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: 'ask later',
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
              'ask later',
              style: AppTypography.ui.copyWith(
                color: palette.coach,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
