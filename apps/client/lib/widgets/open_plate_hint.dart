// `OpenPlateHint` widget — the open-plate whisper anchor (FR5 /
// UX-DR5 / AC #4).
//
// Renders inside an `OpenDent` row on the Day Board when the active
// `Coach` port returns a non-empty `openPlate` question for the
// dent's pattern. Serif italic + sage accent (UX-DR5: no `[sure]` /
// `[ask later]` on this surface — tapping the hint records the
// interaction and clears the hint).
//
// The widget is quiet: no spinner, no countdown, no badge. Tapping
// the hint invokes `recordCoachInteractionProvider.recordOpenPlateDismiss(...)`,
// which materialises a synthetic `CoachNote` (anchor: openPlate,
// plateLogId: 0 sentinel) and writes the `dismiss` interaction log
// row through the same port. The widget itself has no `ref` listener —
// it owns the UI hygiene via local state (`onTap` toggles
// `_hintDismissed` in `OpenDent`).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/coach_note_provider.dart';
import '../theme/app_tokens.dart';

class OpenPlateHint extends ConsumerWidget {
  const OpenPlateHint({
    super.key,
    required this.questionKey,
    required this.question,
    required this.onDismissed,
  });

  /// The reviewable key the active `Coach` rung resolved for the
  /// `(openPlate, pattern)` pair. The use-case persists this on the
  /// synthetic `CoachNote` so the row can be deduped on `key` alone
  /// (AD-7 / NFR3).
  final String questionKey;

  /// The verbatim copy the active `Coach` rung resolved for the
  /// `(openPlate, pattern)` pair. Plain text only — no decorative
  /// unicode, no color tokens (NFR7).
  final String question;

  /// Tapped hint — the parent records the `dismiss` interaction
  /// and clears the hint. `null` disables the tap target.
  final VoidCallback? onDismissed;

  Future<void> _recordDismiss(WidgetRef ref) async {
    // AD-3: every interaction flows through the use-case, which
    // wraps `CoachNoteStore.append` + `recordInteraction`. The
    // synthetic CoachNote (anchor: openPlate, plateLogId: 0) gives
    // the interaction log row a durable back-ref at the database
    // layer (same convention as the rest of the schema).
    await ref
        .read(recordCoachInteractionProvider)
        .recordOpenPlateDismiss(
          questionKey: questionKey,
          questionText: question,
        );
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
      label: 'Open plate hint: $question',
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
      onTap: onDismissed == null
          ? null
          : () async {
              await _recordDismiss(ref);
              onDismissed!.call();
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
            style: AppTypography.coach.copyWith(color: palette.sage),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    );
  }
}
