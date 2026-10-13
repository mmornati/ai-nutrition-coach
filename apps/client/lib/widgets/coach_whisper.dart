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
//   * `[sure]` opens an inline `CoachDepthPanel` and asks the
//     `depthFollowUpProvider` notifier to `request()` the follow-up (the
//     write happens in that method, not in building a provider — F6). The
//     state resolves to the bounded follow-up note (or `null` on the
//     calm-degrade path) and the panel renders the follow-up copy +
//     `[close]` pill.
//   * `[ask later]` records the `askLater` interaction through the
//     use-case (which also persists the durable dismissal marker, so the
//     whisper stays gone after a restart) AND self-clears — the widget
//     removes itself from the tree (`_dismissed` flag) so the whisper
//     disappears with no nag. The widget no longer depends on the parent
//     wiring `onAskLater` for the AC #2 contract.
//   * `[close]` on the depth panel records the `depthAnswer`
//     interaction through the use-case and removes the depth panel.
//     The underlying whisper returns to its `[sure]` / `[ask later]`
//     form.
//
// The widget is a `ConsumerStatefulWidget` — the depth panel's
// visibility and the dismissed state are local (Riverpod's
// `autoDispose` family keys each follow-up on the post-resolve
// note, so the widget owns the "is the panel showing" boolean to
// avoid re-firing the use-case on every rebuild).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/coach_note_provider.dart';
import '../theme/app_tokens.dart';
import 'coach_depth_panel.dart';
import '../l10n/l10n.dart';

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

  /// `true` after the user taps `[ask later]` — the widget removes
  /// itself from the tree so the whisper disappears (AC #2, FR5).
  /// The interaction log row was already written through
  /// `recordCoachInteractionProvider` before this flag flips; local
  /// state is the calm UI.
  bool _dismissed = false;

  void _openDepthPanel() {
    setState(() => _depthPanelVisible = true);
    // The one place the follow-up is requested (idempotent in the notifier).
    // After the frame that mounts the panel: the (autoDispose) provider is
    // watched by then, so the notifier we ask is the one the panel reads —
    // requesting before the first watch would create it, find no listener
    // and dispose it again.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(depthFollowUpProvider(widget.note).notifier).request();
    });
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
    // local log captures the dismissal (FR5 / FR9). The widget then
    // self-clears via `_dismissed` so the whisper disappears with no
    // nag (AC #2, HAPPY_PATH_ASK_LATER) — the parent can also chain
    // a follow-up callback via `widget.onAskLater` for its own UI
    // hygiene, but the widget no longer depends on the parent to
    // disappear.
    await ref.read(recordCoachInteractionProvider)(
      note: widget.note,
      kind: CoachInteraction.askLater,
    );
    if (!mounted) return;
    setState(() => _dismissed = true);
    widget.onAskLater?.call();
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    // NFR8: reduced-motion collapses the entrance to a fade only.
    final motion =
        MediaQuery.of(context).accessibleNavigation ||
        MediaQuery.of(context).disableAnimations;

    // Self-managed dismissal: once the user taps `[ask later]`, the
    // widget removes itself from the tree. AC #2 / HAPPY_PATH_ASK_LATER
    // require "the whisper disappears with no nag" — the parent may
    // also be hiding the row, but the widget must clear itself
    // regardless so the contract holds even when the parent does
    // not wire `onAskLater`.
    if (_dismissed) {
      return const SizedBox.shrink();
    }

    // Watch the depth follow-up state so the depth panel renders when the
    // use-case resolves. The family is keyed on the post-resolve `note`;
    // tapping `[sure]` once requests the follow-up, the state resolves, and
    // the depth panel renders with the follow-up copy. Tapping `[sure]`
    // again is a no-op (the notifier only acts from idle).
    final depth = _depthPanelVisible
        ? ref.watch(depthFollowUpProvider(widget.note))
        : const DepthFollowUpIdle();

    return Semantics(
      container: true,
      label: context.l10n.coachQuestionSemantics(widget.question),
      child: motion
          ? _buildBody(palette, depth)
          : AnimatedOpacity(
              opacity: 1.0,
              duration: const Duration(milliseconds: 220),
              child: _buildBody(palette, depth),
            ),
    );
  }

  Widget _buildBody(AppPalette palette, DepthFollowUpState depth) {
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
          // A Wrap, not a Row: in the narrow text column of a plate row the
          // two 48dp pills would overflow on a phone.
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            children: [
              _SurePill(palette: palette, onTap: _openDepthPanel),
              _AskLaterPill(palette: palette, onTap: _onAskLater),
            ],
          ),
          if (_depthPanelVisible) ...[
            const SizedBox(height: AppSpacing.xs),
            switch (depth) {
              DepthFollowUpReady(:final note) => CoachDepthPanel(
                question: note?.text,
                onClose: _closeDepthPanel,
              ),
              DepthFollowUpIdle() || DepthFollowUpLoading() =>
                const CoachDepthPanel(question: null, onClose: null),
            },
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
      label: context.l10n.sure,
      child: Material(
        color: palette.sageDeep,
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
              context.l10n.sure,
              style: AppTypography.ui.copyWith(color: palette.background),
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
      label: context.l10n.askLater,
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
              context.l10n.askLater,
              style: AppTypography.ui.copyWith(color: palette.coach),
            ),
          ),
        ),
      ),
    );
  }
}
