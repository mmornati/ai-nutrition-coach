// One meal row on the Day Board (UX-DR3 / NFR6 / NFR8).
//
// Vertical stack with hairline rules — no cards, no fills, no dashboard
// grid. The row's hit target is the full 48px minimum (NFR7) and the
// time stamp, balance arc, quantity hint, and status chip all share
// the same horizontal line. Text scales gracefully (NFR7) and the
// dark-mode palette comes from `AppPalette.dark` (NFR8).
//
// Story 2.2 surfaces the post-resolve whisper below the food entry
// summary and above the balance arc when the plate has a post-resolve
// `CoachNote` in the store (watched as a stream, so a note written just
// after the commit still appears — F6) that the user has not dismissed
// (durable marker, `coachDismissalsProvider`). Plates without a note (the
// legacy-data path) render unchanged. Story 2.3 wires the whisper's
// `[sure]` / `[ask later]` callbacks to the answer / dismiss /
// depth interaction via the `recordCoachInteractionProvider`.
//
// Privacy (PV5): press and hold a plate - or use the screen reader action
// "Remove this plate" - to remove it after a calm confirm; its coach note goes
// with it.
//
// The balance arc is computed from the food groups of the plate's entries
// (persisted since schema v4 — F2 / F9): a quadrant is filled when a food
// of that group is on the plate. It is a quiet marker, never a score.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart' show CustomSemanticsAction;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/coach_note_provider.dart';
import '../state/day_board_provider.dart';
import '../state/record_plate_provider.dart';
import '../theme/app_tokens.dart';
import 'balance_arc.dart';
import 'coach_whisper.dart';
import 'status_chip.dart';
import '../l10n/l10n.dart';

/// Keys of the remove-confirm dialog's buttons (tests, a11y).
const Key plateRemoveKeepKey = ValueKey<String>('plate-remove-keep');
const Key plateRemoveConfirmKey = ValueKey<String>('plate-remove-confirm');

class PlateRow extends ConsumerWidget {
  const PlateRow({super.key, required this.slot, required this.plate});

  final MealSlot slot;
  final PlateLog plate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final first = plate.entries.isEmpty ? null : plate.entries.first;
    final dish = first?.databaseFood.displayName ?? '—';
    final more = plate.entries.length > 1
        ? ' +${plate.entries.length - 1}'
        : '';
    final time = context.clockTime(plate.loggedAtUtc.toLocal());
    final range = _rangeLabel(first?.quantity);
    final filled = balanceCoverage([
      for (final e in plate.entries) e.databaseFood.foodGroup,
    ]);

    // Story 2.2: the post-resolve whisper anchors to this plate
    // when the store has a post-resolve CoachNote for it. The
    // legacy-data path (pre-2.2 plates) renders without the
    // whisper.
    final notes = ref.watch(coachNotesForPlateProvider(plate.id)).value;
    final dismissed =
        ref.watch(coachDismissalsProvider).value ?? const <String>{};
    // Story 2.3: the post-resolve note is the whisper's anchor; the depth
    // follow-up use-case appends to the same plate.
    CoachNote? anchorNote;
    for (final n in notes ?? const <CoachNote>[]) {
      if (n.anchor == CoachAnchor.postResolve) {
        anchorNote = n;
        break;
      }
    }
    final whisperNote =
        anchorNote != null &&
            !dismissed.contains(coachNoteDismissalKey(anchorNote.id))
        ? anchorNote
        : null;

    final l10n = context.l10n;
    void remove() => _confirmAndRemove(context, ref, '$dish$more');

    // PV5: removing a plate is reachable three ways - press and hold, the
    // screen reader's custom action, and the long-press semantic action - so
    // it is never gesture-only.
    return Semantics(
      container: true,
      label: l10n.plateRowSemantics(l10n.slotLabel(slot), dish, more, range),
      hint: l10n.plateRemoveHint,
      onLongPress: remove,
      customSemanticsActions: {
        CustomSemanticsAction(label: l10n.plateRemoveAction): remove,
      },
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        // The Semantics above already carries the long-press action; a second
        // semantic node for the same gesture would be announced twice.
        excludeFromSemantics: true,
        onLongPress: remove,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppTouchTargets.min),
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
                    time,
                    style: AppTypography.mono.copyWith(color: palette.inkMuted),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                BalanceArc(filled: filled, size: 48, announceFilled: false),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        context.l10n.slotLabel(slot),
                        style: AppTypography.ui.copyWith(color: palette.ink),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$dish$more',
                        style: AppTypography.uiMuted.copyWith(
                          color: palette.inkMuted,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      // Quantity + sync status sit under the dish, wrapping, so
                      // a long status never overflows a phone-width row.
                      Wrap(
                        spacing: AppSpacing.sm,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            range,
                            style: AppTypography.mono.copyWith(
                              color: palette.inkMuted,
                            ),
                          ),
                          StatusChip(plateLogId: plate.id),
                        ],
                      ),
                      if (whisperNote != null) ...[
                        const SizedBox(height: AppSpacing.sm),
                        CoachWhisper(
                          key: ValueKey<int>(whisperNote.id),
                          question: whisperNote.text,
                          note: whisperNote,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// A calm confirm, then the removal. Everything that needs the context is
  /// captured before the first await.
  Future<void> _confirmAndRemove(
    BuildContext context,
    WidgetRef ref,
    String dish,
  ) async {
    final l10n = context.l10n;
    final messenger = ScaffoldMessenger.maybeOf(context);
    final remove = ref.read(deletePlateProvider);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.plateRemoveTitle),
        content: Text(l10n.plateRemoveBody(dish)),
        actions: [
          TextButton(
            key: plateRemoveKeepKey,
            style: TextButton.styleFrom(
              minimumSize: const Size(AppTouchTargets.min, AppTouchTargets.min),
            ),
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.plateRemoveKeep),
          ),
          TextButton(
            key: plateRemoveConfirmKey,
            style: TextButton.styleFrom(
              minimumSize: const Size(AppTouchTargets.min, AppTouchTargets.min),
            ),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.plateRemoveConfirm),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final result = await remove(plate.id);
    messenger?.showSnackBar(
      SnackBar(
        content: Text(
          result is PlateDeleted ? l10n.plateRemoved : l10n.plateRemoveFailed,
        ),
      ),
    );
  }

  String _rangeLabel(QuantityRange? q) {
    if (q == null) return '';
    return q.displayLabel;
  }
}
