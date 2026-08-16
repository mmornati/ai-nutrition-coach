// An "open dent" — the quiet place a meal row will fill when it's logged
// (UX-DR10).
//
// Mono copy, no spinner, no countdown, no streak, no CTA. The literal
// "An open, quiet place." string is the spec-approved copy and must
// not be paraphrased.
//
// Story 2.3 adds the open-plate hint anchor: when the active `Coach`
// port returns a non-empty `(openPlate, pattern)` question, an
// `OpenPlateHint` renders below the existing copy. The hint is
// quiet — no `[sure]` / `[ask later]` — and tapping it records the
// `dismiss` interaction and clears the hint.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/coach_provider.dart';
import '../state/day_board_provider.dart';
import '../theme/app_tokens.dart';
import 'open_plate_hint.dart';

class OpenDent extends ConsumerStatefulWidget {
  const OpenDent({super.key, required this.slot});

  final MealSlot slot;

  @override
  ConsumerState<OpenDent> createState() => _OpenDentState();
}

class _OpenDentState extends ConsumerState<OpenDent> {
  /// `true` after the user taps the open-plate hint — the hint
  /// hides immediately so the dent returns to its quiet form. The
  /// store has the durable record (FR9); local state is the calm
  /// UI.
  bool _hintDismissed = false;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final coach = ref.watch(coachProvider);
    final result = coach.questionFor(
      anchor: CoachAnchor.openPlate,
      // Open dents do not have a resolved pattern (there is no
      // plate yet). We default to `balanced` for the open-plate
      // hint — the calm nudge is the same regardless of which
      // pattern the user eventually logs. The active rung returns
      // `NoCoachQuestion` if the entry is missing in the key
      // store.
      pattern: CompositionPattern.balanced,
    );
    final String? hintText = switch (result) {
      CoachFound(:final question) => question.text,
      NoCoachQuestion() => null,
    };
    final String? hintKey = switch (result) {
      CoachFound(:final question) => question.key,
      NoCoachQuestion() => null,
    };

    return Semantics(
      container: true,
      label: '${widget.slot.label} is open. An open, quiet place.',
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
                    widget.slot.label,
                    style: AppTypography.ui
                        .copyWith(color: palette.inkMuted),
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
                  if (hintText != null && !_hintDismissed)
                    OpenPlateHint(
                      questionKey: hintKey!,
                      question: hintText,
                      onDismissed: () => setState(() => _hintDismissed = true),
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
