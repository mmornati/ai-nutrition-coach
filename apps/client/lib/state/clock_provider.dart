// The injectable "now" for date-sensitive UI (Day Board "today",
// week strip, day title) and "today" itself.
//
// Production resolves to `DateTime.now`; tests override it with a fixed
// instant so assertions never depend on the wall-clock date.

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Returns the current local time. Override in tests:
/// `clockProvider.overrideWithValue(() => DateTime(2026, 8, 15, 12))`.
final Provider<DateTime Function()> clockProvider =
    Provider<DateTime Function()>((ref) => DateTime.now);

/// 00:00 local of the current calendar day, per [clockProvider].
///
/// Everything that means "today" watches this provider rather than reading
/// the clock directly, so there is ONE place that decides what day it is.
/// It does not tick by itself: the Day Board (`DayBoardScreen`) arms a timer
/// to the next local midnight (`untilNextLocalMidnight`, calendar arithmetic
/// — DST-safe) and invalidates this provider when it fires, so a board left
/// open across midnight moves on to the new day (security review F3: "today"
/// used to be captured once). The timer lives in the widget, not here, so it
/// is cancelled with the screen and never outlives a test's widget tree.
final Provider<DateTime> todayProvider = Provider<DateTime>((ref) {
  return startOfLocalDay(ref.watch(clockProvider)());
});
