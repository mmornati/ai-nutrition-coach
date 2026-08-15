// The Day Board — today's plates (UX-DR3 / UX-DR10 / NFR6 / NFR7 / NFR8).
//
// Vertical stack of meal rows (Breakfast / Lunch / Dinner) interleaved
// with open dents where no plate was logged. The full day is always
// visible; hairline rules separate rows; no cards, no fills, no
// dashboard grid (UX-DR3). On `StoreFailure` the screen renders a
// single calm line "History can't load right now." under the title — no
// retry button, no spinner, no countdown.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/day_board_provider.dart';
import '../theme/app_tokens.dart';
import '../widgets/open_dent.dart';
import '../widgets/plate_row.dart';

class DayBoardScreen extends ConsumerWidget {
  const DayBoardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final state = ref.watch(dayBoardProvider);

    return Scaffold(
      backgroundColor: palette.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.lg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Today',
                style: AppTypography.ui.copyWith(color: palette.ink),
              ),
              const SizedBox(height: AppSpacing.xs),
              if (state.hasError)
                Text(
                  "History can't load right now.",
                  style: AppTypography.coach.copyWith(color: palette.inkMuted),
                ),
              const SizedBox(height: AppSpacing.lg),
              if (state.hasError)
                const SizedBox.shrink()
              else
                Expanded(
                  child: state.when(
                    loading: () => _placeholderList(palette),
                    error: (_, _) => const SizedBox.shrink(),
                    data: (day) => _BoardList(day: day, palette: palette),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  // Reduced-motion / NFR7: no spinner ever on this surface (UX-DR10).
  // While the store is opening, the screen renders the three open
  // dents — the day is always visible.
  Widget _placeholderList(AppPalette palette) => _BoardList(
        day: null,
        palette: palette,
      );
}

class _BoardList extends StatelessWidget {
  const _BoardList({
    required this.day,
    required this.palette,
  });

  final DayBoardDay? day;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    final slots = day?.slots ?? _placeholderSlots();
    return ListView.separated(
      itemCount: slots.length,
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      separatorBuilder: (_, _) => Divider(
        color: palette.hairline,
        height: AppSpacing.hairline,
      ),
      itemBuilder: (_, i) {
        final slot = slots[i];
        if (slot.isOpen) {
          return OpenDent(slot: slot.slot);
        }
        return PlateRow(slot: slot.slot, plate: slot.plate!);
      },
    );
  }

  List<DayBoardSlot> _placeholderSlots() {
    return [
      for (final s in MealSlot.values) DayBoardSlot.open(slot: s),
    ];
  }
}
