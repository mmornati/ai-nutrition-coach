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
//     (`dayBoardForDateProvider(selected)`); the title reads the weekday of the
//     selected day, e.g. "Tuesday" / "Yesterday".
// The 7-dot `WeekStrip` lives below the plate stack — tapping a dot
// updates `selectedDateProvider` and the surface re-renders for that
// day (UX-DR8).
//
// Story 1.6 layered two affordances on top of the board:
//   * The `CaptureFab` floats at bottom-right; tapping it opens
//     `CaptureSheet`, which fans out to the three entry surfaces
//     (Snapshot / Scan / Type or talk).
//   * A quiet `+ log another plate` link lives above the plate stack
//     for 5 seconds after every successful `RecordPlate` commit, then
//     disappears (UX-DR7 / UX-DR10). Tapping the link re-opens the
//     capture sheet without bouncing the user back through the menu.
//     Rendered conditionally — no `AnimatedOpacity` — so a fresh Day
//     Board does not reserve vertical space for an invisible link.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:integrations/integrations.dart' show enSettingsStrings;

import '../state/clock_provider.dart';
import '../state/day_board_provider.dart';
import '../state/last_log_provider.dart';
import '../state/selected_date_provider.dart';
import '../theme/app_tokens.dart';
import '../widgets/capture_fab.dart';
import '../widgets/capture_sheet.dart';
import '../widgets/open_dent.dart';
import '../widgets/plate_row.dart';
import '../widgets/web_lock_button.dart';
import '../widgets/week_strip.dart';
import 'capture_barcode_screen.dart';
import 'capture_photo_screen.dart';
import 'manual_entry_screen.dart';
import 'settings_screen.dart';

class DayBoardScreen extends ConsumerStatefulWidget {
  const DayBoardScreen({super.key});

  @override
  ConsumerState<DayBoardScreen> createState() => _DayBoardScreenState();
}

class _DayBoardScreenState extends ConsumerState<DayBoardScreen> {
  /// True while the `+ log another plate` link should be visible
  /// above the plate stack. The state is driven by `lastLogProvider`
  /// (set by the entry surfaces after a successful commit) and is
  /// reset to `false` after the 5-second visibility window elapses
  /// (UX-DR7).
  bool _quickRepeatVisible = false;

  /// Timer that flips `_quickRepeatVisible` back to `false` after the
  /// 5-second window. Cancelled and re-armed on every new log so a
  /// rapid sequence of commits extends the window rather than
  /// stacking timers.
  Timer? _hideTimer;

  /// How long the quick-repeat link stays visible after the most
  /// recent successful log. Five seconds — long enough that a thumb
  /// can reach for it, short enough that it never lingers.
  static const Duration _quickRepeatWindow = Duration(seconds: 5);

  @override
  void initState() {
    super.initState();
    // After the first frame, peek at the provider in case a log
    // happened during a prior screen and the listener hasn't fired
    // yet (the listener only reacts to value changes, so a still-fresh
    // value on first build needs to be picked up here).
    WidgetsBinding.instance.addPostFrameCallback((_) => _armFromProvider());
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    super.dispose();
  }

  /// Read `lastLogProvider` once on mount and, if the value is still
  /// within the visibility window, surface the affordance + arm a
  /// timer for the remainder.
  void _armFromProvider() {
    if (!mounted) return;
    final lastLog = ref.read(lastLogProvider);
    if (lastLog == null) return;
    final age = DateTime.now().difference(lastLog);
    if (age >= _quickRepeatWindow) return;
    setState(() => _quickRepeatVisible = true);
    _hideTimer?.cancel();
    _hideTimer = Timer(_quickRepeatWindow - age, _hideQuickRepeat);
  }

  /// Hide the link after the 5-second window elapses. Idempotent —
  /// safe to call from a Timer after the state was already cleared.
  void _hideQuickRepeat() {
    if (!mounted) return;
    setState(() => _quickRepeatVisible = false);
  }

  void _openSettings() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const SettingsScreen()));
  }

  /// Open the capture sheet with the canonical routing wiring. Used
  /// by both the `CaptureFab` and the quick-repeat link so the routes
  /// stay in one place.
  void _openCaptureSheet() {
    showCaptureSheet(
      context,
      onSnapshot: _pushSnapshot,
      onScan: _pushScan,
      onTypeOrTalk: _pushTypeOrTalk,
    );
  }

  /// Push the Snapshot placeholder screen (Story 1.8 wiring). Lives
  /// here so the `CaptureFab` and `_openCaptureSheet` share one
  /// routing site — Story 1.7 / 1.8 replace the placeholder targets
  /// without touching the call sites.
  void _pushSnapshot() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const CapturePhotoScreen()));
  }

  /// Push the barcode-scan placeholder screen (Story 1.7 wiring).
  void _pushScan() {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => const CaptureBarcodeScreen()),
    );
  }

  /// Push the manual entry screen (Story 1.5, already shipped).
  void _pushTypeOrTalk() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute<void>(builder: (_) => const ManualEntryScreen()));
  }

  @override
  Widget build(BuildContext context) {
    // React to `RecordPlate` commits: surface the quick-repeat
    // affordance and arm the 5-second hide timer. We listen for value
    // changes; the initial-state check on first build is in
    // `_armFromProvider`.
    ref.listen<DateTime?>(lastLogProvider, (_, next) {
      if (next == null) return;
      if (!mounted) return;
      setState(() => _quickRepeatVisible = true);
      _hideTimer?.cancel();
      _hideTimer = Timer(_quickRepeatWindow, _hideQuickRepeat);
    });

    final palette = Theme.of(context).brightness == Brightness.dark
        ? AppPalette.dark
        : AppPalette.light;
    final selected = ref.watch(selectedDateProvider);
    final state = selected == null
        ? ref.watch(dayBoardProvider)
        : ref.watch(dayBoardForDateProvider(selected));

    return Scaffold(
      backgroundColor: palette.background,
      floatingActionButton: CaptureFab(
        onSnapshot: _pushSnapshot,
        onScan: _pushScan,
        onTypeOrTalk: _pushTypeOrTalk,
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.lg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _titleFor(selected, ref.watch(clockProvider)()),
                      style: AppTypography.ui.copyWith(color: palette.ink),
                    ),
                  ),
                  // Web only (Phase 2B / W4): manual lock. Renders nothing
                  // on mobile and the dev in-memory store.
                  const WebLockButton(),
                  // Phase 3 / F5: the way into Settings → Your AI /
                  // Your data / About.
                  IconButton(
                    tooltip: enSettingsStrings.openSettings,
                    constraints: const BoxConstraints(
                      minWidth: AppTouchTargets.min,
                      minHeight: AppTouchTargets.min,
                    ),
                    icon: Icon(
                      Icons.settings_outlined,
                      color: palette.inkMuted,
                    ),
                    onPressed: _openSettings,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              if (state.hasError)
                Text(
                  "History can't load right now.",
                  style: AppTypography.coach.copyWith(color: palette.inkMuted),
                ),
              const SizedBox(height: AppSpacing.lg),
              if (_quickRepeatVisible) ...[
                _QuickRepeatLink(onTap: _openCaptureSheet, palette: palette),
                const SizedBox(height: AppSpacing.sm),
              ],
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
  String _titleFor(DateTime? selected, DateTime now) {
    if (selected == null) return 'Today';
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
  Widget _placeholderList(AppPalette palette) =>
      _BoardList(day: null, palette: palette);
}

/// The `+ log another plate` link that surfaces for 5 seconds after a
/// successful `RecordPlate` commit (UX-DR7 / UX-DR10). Quiet copy, no
/// icon, no card, no celebration — just a tap target with the same
/// typography as the open-dent whispers below it.
class _QuickRepeatLink extends StatelessWidget {
  const _QuickRepeatLink({required this.onTap, required this.palette});

  final VoidCallback onTap;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Log another plate',
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppTouchTargets.min),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              vertical: AppSpacing.xs,
              horizontal: AppSpacing.xs,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '+ log another plate',
                  style: AppTypography.coach.copyWith(color: palette.sage),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BoardList extends StatelessWidget {
  const _BoardList({required this.day, required this.palette});

  final DayBoardDay? day;
  final AppPalette palette;

  @override
  Widget build(BuildContext context) {
    final slots = day?.slots ?? _placeholderSlots();
    return ListView.separated(
      itemCount: slots.length,
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      separatorBuilder: (_, _) =>
          Divider(color: palette.hairline, height: AppSpacing.hairline),
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
    return [for (final s in MealSlot.values) DayBoardSlot.open(slot: s)];
  }
}
