// Day Board derived view (AD-3).
//
// Reads the existing `recentPlatesProvider` stream and projects it into the
// three-slot shape the screen renders: one bucket per meal slot
// (Breakfast / Lunch / Dinner) plus an "open dents" view for any slot with
// no plate today. Filters to the user's local day boundary so yesterday's
// plates never leak into the surface.
//
// The provider does not mutate anything; it is a `Provider` over the
// `AsyncValue<List<PlateLog>>` so the screen still sees loading / error
// states the same way it does today. The pre-classification is what the
// screen consumes — no slot arithmetic on the render path.

import 'package:domain_core/domain_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
  const DayBoardSlot.plate({
    required this.slot,
    required this.plate,
  }) : isOpen = false;

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
  const DayBoardDay({
    required this.slots,
    required this.date,
  });

  final List<DayBoardSlot> slots;
  final DateTime date;

  /// Convenience for callers that only need the slots in declaration order.
  DayBoardSlot slot(MealSlot s) => slots[s.index];
}

/// View-model the screen consumes. Carries the same loading / error state
/// as the upstream stream so the UI renders the calm "History can't load
/// right now." line on failure.
class DayBoardState {
  const DayBoardState._({
    required this.async,
  });

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

/// Derived provider — local-day filter + slot bucketing.
///
/// Hour buckets are evaluated in local time (`loggedAtUtc.toLocal().hour`)
/// so a plate logged at 08:00 UTC on a device in UTC-7 lands in
/// Breakfast (1am local), and the same plate in UTC+9 lands in Dinner
/// (5pm local). The week strip (Story 1.4) handles the day picker; this
/// view only ever renders "today".
final dayBoardProvider = Provider<AsyncValue<DayBoardDay>>((ref) {
  final plates = ref.watch(recentPlatesProvider);
  final now = DateTime.now();
  return plates.when(
    loading: () => const AsyncValue.loading(),
    error: (e, st) => AsyncValue.error(e, st),
    data: (list) => AsyncValue.data(_classifyToday(list, now: now)),
  );
});

@visibleForTesting
DayBoardDay classifyToday(List<PlateLog> plates, {DateTime? now}) {
  return _classifyToday(plates, now: now ?? DateTime.now());
}

DayBoardDay _classifyToday(List<PlateLog> plates, {required DateTime now}) {
  final start = DateTime(now.year, now.month, now.day);
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
