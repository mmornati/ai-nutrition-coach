// The week strip — 7 mini-dots and the mono whisper "no streaks · no
// countdowns · no guilt" (UX-DR8 / UX-DR10 / NFR7 / NFR8).
//
// Seven days ending today (today rightmost). Each dot:
//   * fills sage (`palette.sage`) when the day has at least one plate
//     in `recentPlatesProvider`;
//   * shows a hairline outline (`palette.hairline`) when it does not;
//   * exposes a ≥48px hit target;
//   * emits a Semantics label like "Tuesday, balanced" so the screen
//     reader announces date + state (NFR7 — color is never the sole
//     signal).
//
// Tapping a dot writes that day's local-midnight `DateTime` into
// `selectedDateProvider`; the Day Board re-renders for that date
// (selectedDate == null falls back to today). No week-report screen,
// no streak counter, no celebratory bounce — the negative guarantee
// lives in the mono whisper beneath the dots.
//
// "Balanced day" v1 heuristic: any day with ≥1 plate. The strict
// coach-driven balance lands in Epic 2. See the spec's Ask First
// resolution — v1 ships the loose heuristic and revises in Epic 2
// once the coach flow is in place.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/clock_provider.dart';
import '../state/record_plate_provider.dart';
import '../state/selected_date_provider.dart';
import '../theme/app_tokens.dart';

/// The 7-day navigation strip below the Day Board plate stack.
class WeekStrip extends ConsumerWidget {
  const WeekStrip({super.key});

  /// The window length, today inclusive, ordered oldest → today.
  static const int dayCount = 7;

  /// The diameter of the visible dot. The hit target is wider
  /// (≥48px on the short axis — see [_Dot]) so the dot is finger-friendly
  /// even when OS dynamic-type padding adds slack.
  static const double _dotDiameter = 14;

  /// Space between the row of dots and the mono whisper beneath.
  static const double _whisperGap = AppSpacing.sm;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final plates = ref.watch(recentPlatesProvider);
    final today = _localMidnight(ref.watch(clockProvider)());
    final days = _sevenDaysEnding(today);

    return Semantics(
      container: true,
      label: 'Last $dayCount days',
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              for (final day in days)
                Expanded(
                  child: _Dot(
                    diameter: _dotDiameter,
                    balanced: _hasPlate(plates, day),
                    semanticsLabel: _label(day, _hasPlate(plates, day)),
                    onTap: () => _select(ref, day),
                    palette: palette,
                  ),
                ),
            ],
          ),
          const SizedBox(height: _whisperGap),
          Text(
            'no streaks · no countdowns · no guilt',
            textAlign: TextAlign.center,
            style: AppTypography.monoWhisper.copyWith(color: palette.inkMuted),
          ),
        ],
      ),
    );
  }

  /// The 7 local-midnight dates ending in [today], ordered oldest →
  /// today (so today sits rightmost in the Row).
  static List<DateTime> _sevenDaysEnding(DateTime today) {
    return [
      for (var i = dayCount - 1; i >= 0; i--)
        DateTime(today.year, today.month, today.day - i),
    ];
  }

  static DateTime _localMidnight(DateTime moment) {
    return DateTime(moment.year, moment.month, moment.day);
  }

  /// "Balanced" = at least one plate landed on the local day. Loose
  /// v1 heuristic; the strict coach-driven heuristic arrives in Epic 2.
  bool _hasPlate(AsyncValue<List<PlateLog>> plates, DateTime localDay) {
    return plates.maybeWhen(
      data: (list) {
        for (final plate in list) {
          final local = plate.loggedAtUtc.toLocal();
          if (local.year == localDay.year &&
              local.month == localDay.month &&
              local.day == localDay.day) {
            return true;
          }
        }
        return false;
      },
      orElse: () => false,
    );
  }

  /// Semantics label per dot — weekday name + balance state, e.g.
  /// "Tuesday, balanced" / "Tuesday, quiet". Quiet mirrors the
  /// "An open, quiet place." copy on `OpenDent` so the empty-day
  /// language stays consistent.
  String _label(DateTime localDay, bool balanced) {
    final weekday = DateTime(
      localDay.year,
      localDay.month,
      localDay.day,
    ).weekday;
    return '${_weekdayNames[weekday - 1]}, ${balanced ? 'balanced' : 'quiet'}';
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

  void _select(WidgetRef ref, DateTime localDay) {
    ref.read(selectedDateProvider.notifier).state = localDay;
  }
}

class _Dot extends StatelessWidget {
  const _Dot({
    required this.diameter,
    required this.balanced,
    required this.semanticsLabel,
    required this.onTap,
    required this.palette,
  });

  /// Visible dot diameter — smaller than the hit target so the dot
  /// reads as a mini-marker, not a button.
  final double diameter;

  /// When `true`, paint the sage fill; when `false`, paint only the
  /// hairline outline.
  final bool balanced;

  /// The screen-reader announcement, e.g. "Tuesday, balanced".
  final String semanticsLabel;

  /// Invoked when the 48px hit target is tapped.
  final VoidCallback onTap;

  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    final fill = balanced ? palette.sage : Colors.transparent;
    final borderColor = balanced ? palette.sage : palette.hairline;
    // Padding guarantees the 14px visible dot still sits inside a
    // 48px-wide hit area on viewports where the row gives each dot
    // ≥ AppTouchTargets.min. On narrower viewports the Expanded
    // allocation shrinks and the hit target shrinks with it; this is
    // an accepted tradeoff (the strip still renders 7 dots and the
    // semantics labels stay correct — see M1 review).
    final hitPad = (AppTouchTargets.min - diameter) / 2;

    return Semantics(
      label: semanticsLabel,
      button: true,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Center(
          child: Padding(
            padding: EdgeInsets.all(hitPad),
            child: Container(
              width: diameter,
              height: diameter,
              decoration: BoxDecoration(
                color: fill,
                border: Border.all(color: borderColor, width: 1.5),
                shape: BoxShape.circle,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
