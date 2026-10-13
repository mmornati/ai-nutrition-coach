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

import '../state/coach_note_provider.dart';
import '../state/coach_provider.dart';
import '../state/day_board_provider.dart';
import '../theme/app_tokens.dart';
import 'open_plate_hint.dart';
import '../l10n/l10n.dart';

class OpenDent extends ConsumerStatefulWidget {
  const OpenDent({super.key, required this.slot, required this.day});

  final MealSlot slot;

  /// The local day this dent belongs to — with [slot] it keys the durable
  /// dismissal of the open-plate hint (a new day asks again; F6).
  final DateTime day;

  @override
  ConsumerState<OpenDent> createState() => _OpenDentState();
}

class _OpenDentState extends ConsumerState<OpenDent> {
  /// `true` right after the user taps the open-plate hint — the hint hides
  /// immediately so the dent returns to its quiet form, without waiting for
  /// the store round trip. The durable record is the dismissal marker
  /// (`coachDismissalsProvider`), which also keeps it hidden after a restart.
  bool _hintDismissed = false;

  /// The open-plate question (text + key), resolved once. Open dents have
  /// no resolved pattern (there is no plate yet), so the calm `balanced`
  /// nudge is used regardless of what the user eventually logs; the active
  /// rung returns `NoCoachQuestion` if the entry is missing in the key
  /// store. Resolved in `initState` rather than every `build` — the answer
  /// does not change, and a rebuild must not re-ask the coach.
  late final CoachQuestion? _hint;

  @override
  void initState() {
    super.initState();
    final result = ref
        .read(coachProvider)
        .questionFor(
          anchor: CoachAnchor.openPlate,
          pattern: CompositionPattern.balanced,
        );
    _hint = switch (result) {
      CoachFound(:final question) => question,
      NoCoachQuestion() => null,
    };
  }

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final hint = _hint;
    final dismissalKey = openPlateDismissalKey(
      day: widget.day,
      slotName: widget.slot.name,
    );
    final dismissedForGood =
        ref.watch(coachDismissalsProvider).value?.contains(dismissalKey) ??
        false;

    return Semantics(
      container: true,
      label: context.l10n.openDentSemantics(
        context.l10n.slotLabel(widget.slot),
      ),
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
                    context.l10n.slotLabel(widget.slot),
                    style: AppTypography.ui.copyWith(color: palette.inkMuted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    context.l10n.openDentWhisper,
                    style: AppTypography.monoWhisper.copyWith(
                      color: palette.inkMuted,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (hint != null && !_hintDismissed && !dismissedForGood)
                    OpenPlateHint(
                      questionKey: hint.key,
                      question: hint.text,
                      dismissalKey: dismissalKey,
                      onDismissed: () {
                        // The tap awaits a store write first; the dent may
                        // be gone by then.
                        if (mounted) setState(() => _hintDismissed = true);
                      },
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
