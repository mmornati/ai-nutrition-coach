// Day Board derived view (AD-3).
//
// Reads the existing `recentPlatesProvider` stream and projects it into the
// three-slot shape the screen renders: one bucket per meal slot
// (Breakfast / Lunch / Dinner) plus an "open dents" view for any slot with
// no plate on the selected local day. Filters to the local day boundary
// so plates from other days never leak into the surface.
//
// The provider does not mutate anything; it is a `Provider` over the
// `AsyncValue<List<PlateLog>>` so the screen still sees loading / error
// states the same way it does today. The pre-classification is what the
// screen consumes — no slot arithmetic on the render path.
//
// Story 1.4 split the bucket logic into a `_classifyForDate(plates,
// date)` helper so the same view serves both `dayBoardProvider` (today)
// and `dayBoardForDateProvider(date)` (the selected local day from the
// week strip). The no-arg `dayBoardProvider` is preserved for
// backward compatibility with Story 1.3's call sites.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/clock_provider.dart';
import '../state/record_plate_provider.dart';

/// The three meal slots the day is divided into. Anything outside the
/// hours that define these slots belongs to an open dent.
enum MealSlot {
  breakfast,
  lunch,
  dinner;

  String get label => switch (this) {
    MealSlot.breakfast => 'Breakfast',
    MealSlot.lunch => 'Lunch',
    MealSlot.dinner => 'Dinner',
  };

  /// Inclusive hour range for this slot in local time.
  ({int startHour, int endHour}) get hours => switch (this) {
    MealSlot.breakfast => (startHour: 5, endHour: 10),
    MealSlot.lunch => (startHour: 11, endHour: 15),
    MealSlot.dinner => (startHour: 16, endHour: 22),
  };
}

/// A single bucket on the Day Board — either a logged plate or an open
/// quiet dent. The screen renders one of these per slot.
@immutable
class DayBoardSlot {
  const DayBoardSlot.plate({required this.slot, required this.plate})
    : isOpen = false;

  const DayBoardSlot.open({required this.slot}) : isOpen = true, plate = null;

  final MealSlot slot;
  final bool isOpen;

  /// The plate that landed in this slot. `null` when the slot is open.
  final PlateLog? plate;
}

/// The day the screen is rendering. Local-day bounds (00:00 local, exclusive
/// end at next 00:00 local) so the filter stays user-local.
@immutable
class DayBoardDay {
  const DayBoardDay({required this.slots, required this.date});

  final List<DayBoardSlot> slots;
  final DateTime date;

  /// Convenience for callers that only need the slots in declaration order.
  DayBoardSlot slot(MealSlot s) => slots[s.index];
}

/// View-model the screen consumes. Carries the same loading / error state
/// as the upstream stream so the UI renders the calm "History can't load
/// right now." line on failure.
class DayBoardState {
  const DayBoardState._({required this.async});

  factory DayBoardState.loading() =>
      const DayBoardState._(async: AsyncValue.loading());

  factory DayBoardState.data(DayBoardDay day) =>
      DayBoardState._(async: AsyncValue.data(day));

  factory DayBoardState.error(Object error, StackTrace stack) =>
      DayBoardState._(async: AsyncValue.error(error, stack));

  final AsyncValue<DayBoardDay> async;

  bool get isLoading => async.isLoading;
  bool get hasError => async.hasError;
  DayBoardDay? get data => async.value;
}

/// Derived provider — local-day filter + slot bucketing, scoped to
/// "today" (local). Hour buckets are evaluated in local time
/// (`loggedAtUtc.toLocal().hour`) so a plate logged at 08:00 UTC on a
/// device in UTC-7 lands in Breakfast (1am local), and the same plate
/// in UTC+9 lands in Dinner (5pm local).
///
/// Backward compat: this provider remains the no-arg "today" view that
/// Story 1.3 wired into `DayBoardScreen`; the day-strip navigation
/// surface added in Story 1.4 reads `selectedDateProvider` and
/// switches to `dayBoardForDateProvider` for non-today selections.
final dayBoardProvider = Provider<AsyncValue<DayBoardDay>>((ref) {
  final plates = ref.watch(recentPlatesProvider);
  final now = ref.watch(clockProvider)();
  return plates.when(
    loading: () => const AsyncValue.loading(),
    error: (e, st) => AsyncValue.error(e, st),
    data: (list) => AsyncValue.data(_classifyForDate(list, date: now)),
  );
});

/// Date-aware variant of [dayBoardProvider] — used by `DayBoardScreen`
/// after the user taps a week-strip dot. The argument is a local-midnight
/// `DateTime` for the day to render; passing `DateTime.now()` is
/// equivalent to the no-arg [dayBoardProvider] above.
///
/// The family key is normalized via `DateUtils.dateOnly` so two
/// `DateTime`s that point at the same local midnight collapse to one
/// cache entry — otherwise `DateTime(2026, 8, 15)` (midnight) and
/// `DateTime(2026, 8, 15, 0, 0, 0, 1)` (1ms past midnight) would each
/// allocate their own slot in the family cache.
final dayBoardForDateProvider =
    Provider.family<AsyncValue<DayBoardDay>, DateTime>((ref, date) {
      final localDay = DateUtils.dateOnly(date);
      final plates = ref.watch(recentPlatesProvider);
      return plates.when(
        loading: () => const AsyncValue.loading(),
        error: (e, st) => AsyncValue.error(e, st),
        data: (list) => AsyncValue.data(_classifyForDate(list, date: localDay)),
      );
    });

@visibleForTesting
DayBoardDay classifyForDate(List<PlateLog> plates, {required DateTime date}) {
  return _classifyForDate(plates, date: date);
}

DayBoardDay _classifyForDate(List<PlateLog> plates, {required DateTime date}) {
  final start = DateTime(date.year, date.month, date.day);
  final end = start.add(const Duration(days: 1));

  final perSlot = <MealSlot, PlateLog?>{
    for (final s in MealSlot.values) s: null,
  };

  for (final plate in plates) {
    final local = plate.loggedAtUtc.toLocal();
    if (local.isBefore(start) || !local.isBefore(end)) {
      continue;
    }
    final slot = _slotFor(local.hour);
    if (slot == null) continue;
    // Multiple plates in the same slot — keep the most recent one. The
    // slot row would otherwise have to disambiguate, and the spec's
    // I/O matrix only covers at most one plate per slot.
    final existing = perSlot[slot];
    if (existing == null || plate.loggedAtUtc.isAfter(existing.loggedAtUtc)) {
      perSlot[slot] = plate;
    }
  }

  final slots = <DayBoardSlot>[
    for (final s in MealSlot.values)
      if (perSlot[s] != null)
        DayBoardSlot.plate(slot: s, plate: perSlot[s]!)
      else
        DayBoardSlot.open(slot: s),
  ];

  return DayBoardDay(slots: slots, date: start);
}

MealSlot? _slotFor(int localHour) {
  for (final s in MealSlot.values) {
    final h = s.hours;
    if (localHour >= h.startHour && localHour <= h.endHour) {
      return s;
    }
  }
  return null;
}
