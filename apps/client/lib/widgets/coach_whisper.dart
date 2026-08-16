// `CoachWhisper` widget — the post-resolve whisper on a plate row
// (UX-DR5 / NFR3 / NFR7 / NFR8 / FR4 / FR5).
//
// Layout: serif-italic question + `[sure]` sage pill + `[ask later]`
// quiet amber outline pill. Both buttons hit ≥48px on the short
// axis (NFR7). Reduced-motion collapses the entrance to a fade only
// (NFR8). Color is never the sole signal — the buttons carry the
// action by label (`sure` / `ask later`), the text carries the
// question, the color is the affordance only.
//
// Story 2.3 wires the answer / dismiss / depth interaction:
//   * `[sure]` calls `onSure` which the parent wires to the depth
//     panel via `depthFollowUpProvider`. The widget renders an
//     inline `CoachDepthPanel` below the question when the
//     provider resolves to a follow-up note (or to `null` for the
//     calm-degrade path).
//   * `[ask later]` calls `onAskLater` which the parent wires to
//     `RecordCoachInteraction(kind: askLater)` and clears the
//     whisper.
//   * `[close]` on the depth panel calls `onClose` which the
//     parent wires to `RecordCoachInteraction(kind: depthAnswer)`
//     and removes the depth panel.
//
// The widget is a `ConsumerStatefulWidget` — the depth panel's
// visibility is local state (Riverpod's `autoDispose` family keys
// each follow-up on the post-resolve note, so the widget owns the
// "is the panel showing" boolean to avoid re-firing the use-case
// on every rebuild).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/coach_note_provider.dart';
import '../theme/app_tokens.dart';
import 'coach_depth_panel.dart';

class CoachWhisper extends ConsumerStatefulWidget {
  const CoachWhisper({
    super.key,
    required this.question,
    required this.note,
    this.onAskLater,
  });

  /// The verbatim copy the active `Coach` rung resolved. Plain text
  /// only — no decorative unicode, no color tokens (NFR7).
  final String question;

  /// The post-resolve `CoachNote` this whisper renders. The widget
  /// passes it to `depthFollowUpProvider` (Story 2.3) so the depth
  /// follow-up use-case appends to the same plate.
  final CoachNote note;

  /// Optional post-tap callback the parent can use to clear the
  /// whisper from its own surface (e.g. hiding the row, dismissing
  /// the Day Board entry). The widget records the `askLater`
  /// interaction through `recordCoachInteractionProvider`
  /// regardless of whether this callback is set; the callback is
  /// for the parent's local UI hygiene only.
  final VoidCallback? onAskLater;

  @override
  ConsumerState<CoachWhisper> createState() => _CoachWhisperState();
}

class _CoachWhisperState extends ConsumerState<CoachWhisper> {
  /// `true` after the user taps `[sure]` — the depth panel renders
  /// below the question until `[close]` fires. Local state so the
  /// widget doesn't re-fire the use-case on every rebuild.
  bool _depthPanelVisible = false;

  void _openDepthPanel() {
    setState(() => _depthPanelVisible = true);
  }

  Future<void> _closeDepthPanel() async {
    setState(() => _depthPanelVisible = false);
    // Record the `depthAnswer` interaction so the local log
    // captures the depth panel close (FR5 / FR9). The use-case
    // collapses a store-write failure to a typed result; the UI
    // still reflects the user's intent (depth panel closed,
    // underlying whisper returns to its `[sure]` / `[ask later]`
    // form).
    await ref.read(recordCoachInteractionProvider)(
      note: widget.note,
      kind: CoachInteraction.depthAnswer,
    );
  }

  Future<void> _onAskLater() async {
    // Record the `askLater` interaction through the use-case so the
    // local log captures the dismissal (FR5 / FR9). The parent can
    // chain a follow-up callback via `widget.onAskLater` for its
    // own UI hygiene (e.g. hiding the row).
    await ref.read(recordCoachInteractionProvider)(
      note: widget.note,
      kind: CoachInteraction.askLater,
    );
    widget.onAskLater?.call();
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    // NFR8: reduced-motion collapses the entrance to a fade only.
    final motion = MediaQuery.of(context).accessibleNavigation ||
        MediaQuery.of(context).disableAnimations;

    // Watch the depth follow-up provider so the depth panel renders
    // when the use-case resolves. The family is keyed on the
    // post-resolve `note`; tapping `[sure]` once fires the
    // use-case, the provider resolves, and the depth panel renders
    // with the follow-up copy. Tapping `[sure]` again is a no-op
    // (the use-case's idempotency guard sees an existing follow-up
    // for the plate and returns `null`).
    final depthAsync = _depthPanelVisible
        ? ref.watch(depthFollowUpProvider(widget.note))
        : const AsyncValue<CoachNote?>.data(null);

    return Semantics(
      container: true,
      label: 'Coach question: ${widget.question}',
      child: motion
          ? _buildBody(palette, depthAsync)
          : AnimatedOpacity(
              opacity: 1.0,
              duration: const Duration(milliseconds: 220),
              child: _buildBody(palette, depthAsync),
            ),
    );
  }

  Widget _buildBody(
    AppPalette palette,
    AsyncValue<CoachNote?> depthAsync,
  ) {
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
            widget.question,
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
                onTap: _openDepthPanel,
              ),
              const SizedBox(width: AppSpacing.sm),
              _AskLaterPill(
                palette: palette,
                onTap: _onAskLater,
              ),
            ],
          ),
          if (_depthPanelVisible) ...[
            const SizedBox(height: AppSpacing.xs),
            depthAsync.when(
              data: (followUp) => CoachDepthPanel(
                question: followUp?.text,
                onClose: _closeDepthPanel,
              ),
              loading: () => const CoachDepthPanel(
                question: null,
                onClose: null,
              ),
              error: (_, _) => const CoachDepthPanel(
                question: null,
                onClose: null,
              ),
            ),
          ],
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
