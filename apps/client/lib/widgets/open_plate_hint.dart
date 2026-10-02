// `OpenPlateHint` widget — the open-plate whisper anchor (FR5 /
// UX-DR5 / AC #4).
//
// Renders inside an `OpenDent` row on the Day Board when the active
// `Coach` port returns a non-empty `openPlate` question for the
// dent's pattern. Serif italic + sage accent (UX-DR5: no `[sure]` /
// `[ask later]` on this surface — tapping the hint dismisses it).
//
// The widget is quiet: no spinner, no countdown, no badge. Tapping the
// hint persists a dismissal marker keyed by (day, slot)
// (`RecordCoachInteraction.dismissOpenPlateHint`) so it stays quiet after a
// restart (F6). There is no synthetic coach note any more — a hint with no
// plate has nothing to anchor a note to. The widget owns the UI hygiene via
// the parent's `onDismissed` (`OpenDent` toggles `_hintDismissed`).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/coach_note_provider.dart';
import '../theme/app_tokens.dart';
import '../l10n/l10n.dart';

class OpenPlateHint extends ConsumerWidget {
  const OpenPlateHint({
    super.key,
    required this.questionKey,
    required this.question,
    required this.dismissalKey,
    required this.onDismissed,
  });

  /// The reviewable key the active `Coach` rung resolved for the
  /// `(openPlate, pattern)` pair (AD-7 / NFR3).
  final String questionKey;

  /// The durable dismissal key (`openPlateDismissalKey(day, slot)`).
  final String dismissalKey;

  /// The verbatim copy the active `Coach` rung resolved for the
  /// `(openPlate, pattern)` pair. Plain text only — no decorative
  /// unicode, no color tokens (NFR7).
  final String question;

  /// Tapped hint — the parent records the `dismiss` interaction
  /// and clears the hint. `null` disables the tap target.
  final VoidCallback? onDismissed;

  Future<void> _recordDismiss(WidgetRef ref) async {
    // AD-3: every interaction flows through the use-case; a failed write is
    // a typed result and the hint still clears for the session.
    await ref
        .read(recordCoachInteractionProvider)
        .dismissOpenPlateHint(dismissalKey);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final motion =
        MediaQuery.of(context).accessibleNavigation ||
        MediaQuery.of(context).disableAnimations;
    return Semantics(
      button: true,
      enabled: onDismissed != null,
      label: context.l10n.openPlateHintSemantics(question),
      child: motion
          ? _buildBody(context, ref, palette)
          : AnimatedOpacity(
              opacity: 1.0,
              duration: const Duration(milliseconds: 220),
              child: _buildBody(context, ref, palette),
            ),
    );
  }

  Widget _buildBody(BuildContext context, WidgetRef ref, AppPalette palette) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: switch (onDismissed) {
        final onDismissed? => () async {
          await _recordDismiss(ref);
          onDismissed();
        },
        null => null,
      },
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
            style: AppTypography.coach.copyWith(color: palette.sageDeep),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    );
  }
}
