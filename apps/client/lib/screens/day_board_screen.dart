// The Day Board — selected day's plates (UX-DR3 / UX-DR10 / NFR6 /
// NFR7 / NFR8).
//
// Vertical stack of meal rows (Breakfast / Lunch / Dinner) interleaved
// with open dents where no plate was logged. The full day is always
// visible; hairline rules separate rows; no cards, no fills, no
// dashboard grid (UX-DR3). On `StoreFailure` the screen renders a
// single calm line "History can't load right now." under the title —
// no retry button, no spinner, no countdown.
//
// Story 1.4 split the data source:
//   * `selectedDateProvider == null` → use the today provider
//     (`dayBoardProvider`); the title reads "Today".
//   * `selectedDateProvider != null` → use the date-aware family
//     (`dayBoardForDateProvider`); the title reads the weekday of the
//     selected day, e.g. "Tuesday" / "Yesterday".
// The 7-dot `WeekStrip` lives below the plate stack — tapping a dot
// updates `selectedDateProvider` and the surface re-renders for that
// day (UX-DR8).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/day_board_provider.dart';
import '../state/selected_date_provider.dart';
import '../theme/app_tokens.dart';
import '../widgets/open_dent.dart';
import '../widgets/plate_row.dart';
import '../widgets/week_strip.dart';

class DayBoardScreen extends ConsumerWidget {
  const DayBoardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final selected = ref.watch(selectedDateProvider);
    final state = selected == null
        ? ref.watch(dayBoardProvider)
        : ref.watch(dayBoardForDateProvider(selected));

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
                _titleFor(selected),
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
              const SizedBox(height: AppSpacing.lg),
              const WeekStrip(),
            ],
          ),
        ),
      ),
    );
  }

  /// Title for the rendered day. `null` → "Today" (the default view);
  /// any other day → the weekday name, or "Yesterday" / "Today" / a
  /// weekday depending on how far back it sits. The strip below
  /// already tells the user which day is selected; the title's job is
  /// to keep that consistent with what the screen is showing.
  String _titleFor(DateTime? selected) {
    if (selected == null) return 'Today';
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    if (selected.year == today.year &&
        selected.month == today.month &&
        selected.day == today.day) {
      return 'Today';
    }
    if (selected.year == yesterday.year &&
        selected.month == yesterday.month &&
        selected.day == yesterday.day) {
      return 'Yesterday';
    }
    return _weekdayName(selected.weekday);
  }

  static const List<String> _weekdayNames = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  String _weekdayName(int weekday) => _weekdayNames[weekday - 1];

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
