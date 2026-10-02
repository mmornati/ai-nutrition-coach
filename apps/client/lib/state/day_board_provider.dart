// Day Board derived view (AD-3).
//
// Projects the plates of ONE local calendar day (a date-ranged watch of the
// store — `platesInRangeProvider`, never the whole history) into the shape
// the screen renders: one bucket per meal slot (Breakfast / Lunch / Dinner)
// plus a "Late / other" bucket for the night hours, each holding ALL the
// plates logged in it, in time order. A slot with no plate is an open dent.
//
// What changed in the security review (F3):
//   * a slot holds a LIST of plates — logging a second lunch no longer hides
//     the first;
//   * 23:00–04:59 is the `late` slot — those plates used to be dropped
//     from the board entirely;
//   * day boundaries are calendar arithmetic (`DateTime(y, m, d + 1)`), not
//     `+ 24h`, so DST days are right;
//   * "today" comes from `todayProvider`, which ticks at local midnight, so
//     a board left open overnight moves on to the new day.
//
// The provider does not mutate anything; the screen still sees loading /
// error states (the calm "History can't load right now." line).

import 'package:domain_core/domain_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'clock_provider.dart';
import 'record_plate_provider.dart';

/// The slots the day is divided into. Hours are local and cover all 24:
/// breakfast 05–10, lunch 11–15, dinner 16–22, late 23–04. `late` is a single
/// slot whose plates are listed in time order (so 00:00–04:59 before 23:xx).
enum MealSlot {
  breakfast,
  lunch,
  dinner,
  late;

  /// `true` for the slots that always render (an open dent when empty). The
  /// `late` slot only renders when it holds a plate — an empty "late" row
  /// would invite logging at night, which is the opposite of calm.
  bool get alwaysShown => this != MealSlot.late;

  /// The slot a local [hour] (0–23) belongs to. Total: every hour has one.
  static MealSlot forHour(int hour) {
    if (hour >= 5 && hour <= 10) return MealSlot.breakfast;
    if (hour >= 11 && hour <= 15) return MealSlot.lunch;
    if (hour >= 16 && hour <= 22) return MealSlot.dinner;
    return MealSlot.late;
  }
}

/// One bucket on the Day Board — the plates logged in a slot, oldest first.
/// Empty means an open quiet dent.
@immutable
class DayBoardSlot {
  DayBoardSlot({required this.slot, required List<PlateLog> plates})
    : plates = List<PlateLog>.unmodifiable(plates);

  final MealSlot slot;

  /// Every plate that landed in this slot on the day, oldest first.
  final List<PlateLog> plates;

  bool get isOpen => plates.isEmpty;
}

/// The day the screen is rendering.
@immutable
class DayBoardDay {
  DayBoardDay({required List<DayBoardSlot> slots, required this.date})
    : slots = List<DayBoardSlot>.unmodifiable(slots);

  /// One entry per [MealSlot], in declaration order.
  final List<DayBoardSlot> slots;

  /// 00:00 local of the rendered day.
  final DateTime date;

  /// The slot entry for [s].
  DayBoardSlot slot(MealSlot s) => slots[s.index];

  /// The slots to draw: the three meals always, `late` only when used.
  List<DayBoardSlot> get visibleSlots => [
    for (final s in slots)
      if (s.slot.alwaysShown || !s.isOpen) s,
  ];

  /// Every plate of the day, oldest first.
  List<PlateLog> get allPlates {
    final all = [for (final s in slots) ...s.plates];
    all.sort((a, b) => a.loggedAtUtc.compareTo(b.loggedAtUtc));
    return all;
  }
}

/// Date-aware derived view: the plates of [date]'s local day. The family key
/// is normalised to local midnight so two `DateTime`s on the same day share
/// one cache entry.
final dayBoardForDateProvider =
    Provider.family<AsyncValue<DayBoardDay>, DateTime>((ref, date) {
      final day = startOfLocalDay(date);
      final plates = ref.watch(platesInRangeProvider(localDayRange(day)));
      return plates.when(
        loading: () => const AsyncValue.loading(),
        error: (e, st) => AsyncValue.error(e, st),
        data: (list) => AsyncValue.data(classifyForDate(list, date: day)),
      );
    });

/// The "today" view the Day Board shows when no day is selected. Follows
/// `todayProvider`, so it rolls over at local midnight by itself.
final dayBoardProvider = Provider<AsyncValue<DayBoardDay>>(
  (ref) => ref.watch(dayBoardForDateProvider(ref.watch(todayProvider))),
);

/// Bucket [plates] into the slots of [date]'s local day. Plates outside the
/// day are ignored (the store already ranges the query; this keeps the
/// function correct for any list).
@visibleForTesting
DayBoardDay classifyForDate(List<PlateLog> plates, {required DateTime date}) {
  final start = startOfLocalDay(date);
  final end = startOfNextLocalDay(date);

  final perSlot = <MealSlot, List<PlateLog>>{
    for (final s in MealSlot.values) s: <PlateLog>[],
  };
  for (final plate in plates) {
    final local = plate.loggedAtUtc.toLocal();
    if (local.isBefore(start) || !local.isBefore(end)) continue;
    perSlot[MealSlot.forHour(local.hour)]!.add(plate);
  }
  return DayBoardDay(
    slots: [
      for (final s in MealSlot.values)
        DayBoardSlot(
          slot: s,
          plates: perSlot[s]!
            ..sort((a, b) => a.loggedAtUtc.compareTo(b.loggedAtUtc)),
        ),
    ],
    date: start,
  );
}
