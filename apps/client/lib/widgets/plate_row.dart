// One meal row on the Day Board (UX-DR3 / NFR6 / NFR8).
//
// Vertical stack with hairline rules — no cards, no fills, no dashboard
// grid. The row's hit target is the full 48px minimum (NFR7) and the
// time stamp, balance arc, quantity hint, and status chip all share the
// same horizontal line. Text scales gracefully (NFR7) and the dark-mode
// palette comes from `AppPalette.dark` (NFR8).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';

import '../state/day_board_provider.dart';
import '../theme/app_tokens.dart';
import 'balance_arc.dart';
import 'status_chip.dart';

class PlateRow extends StatelessWidget {
  const PlateRow({
    super.key,
    required this.slot,
    required this.plate,
  });

  final MealSlot slot;
  final PlateLog plate;

  @override
  Widget build(BuildContext context) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final first = plate.entries.isEmpty ? null : plate.entries.first;
    final dish = first?.databaseFood.displayName ?? '—';
    final more =
        plate.entries.length > 1 ? ' +${plate.entries.length - 1}' : '';
    final time = _localTime(plate.loggedAtUtc);
    final range = _rangeLabel(first?.quantity);
    final filled = _filledFor(first);

    return Semantics(
      container: true,
      label: '${slot.label}, $dish$more, $range',
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
              BalanceArc(
                filled: filled,
                size: 48,
                announceFilled: false,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      slot.label,
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
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                range,
                style: AppTypography.mono.copyWith(color: palette.inkMuted),
              ),
              const SizedBox(width: AppSpacing.sm),
              const StatusChip(),
            ],
          ),
        ),
      ),
    );
  }

  String _rangeLabel(QuantityRange? q) {
    if (q == null) return '';
    return q.displayLabel;
  }

  /// V1 placeholder: the balance arc shows a fixed 3-of-4 fill regardless
  /// of the food on the plate. The `DatabaseFood.foodGroup` taxonomy lands
  /// with the catalog (Story 1.5) — at that point we swap this for a
  /// real coverage computation. Until then the arc is a quiet marker,
  /// not a calorie verdict.
  List<bool> _filledFor(FoodEntry? _) {
    return const [true, true, true, false];
  }
}

String _localTime(DateTime utc) {
  final local = utc.toLocal();
  final hh = local.hour.toString().padLeft(2, '0');
  final mm = local.minute.toString().padLeft(2, '0');
  return '$hh:$mm';
}
