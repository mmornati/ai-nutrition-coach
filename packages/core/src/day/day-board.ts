import { frozenList, type EpochMs } from '../common';
import type { PlateLog } from '../entities/plate-log';
import { startOfLocalDay, startOfNextLocalDay } from '../value-types/calendar-day';
import { isMealSlotAlwaysShown, MEAL_SLOTS, mealSlotForHour, type MealSlot } from './meal-slot';

/** The plates logged in one slot, oldest first. Empty means an open quiet dent. */
export interface DayBoardSlot {
  readonly slot: MealSlot;
  readonly plates: readonly PlateLog[];
}

export interface DayBoardDay {
  /** One entry per `MealSlot`, in declaration order. */
  readonly slots: readonly DayBoardSlot[];
  /** 00:00 local of the rendered day. */
  readonly date: EpochMs;
}

export const isSlotOpen = (slot: DayBoardSlot): boolean => slot.plates.length === 0;

export function dayBoardSlot(day: DayBoardDay, slot: MealSlot): DayBoardSlot {
  return day.slots[MEAL_SLOTS.indexOf(slot)] as DayBoardSlot;
}

/** The slots to draw: the three meals always, `late` only when used. */
export function visibleSlots(day: DayBoardDay): readonly DayBoardSlot[] {
  return day.slots.filter((s) => isMealSlotAlwaysShown(s.slot) || !isSlotOpen(s));
}

/** Every plate of the day, oldest first. */
export function allPlates(day: DayBoardDay): readonly PlateLog[] {
  return day.slots.flatMap((s) => s.plates).sort((a, b) => a.loggedAtUtc - b.loggedAtUtc);
}

/**
 * Buckets `plates` into the slots of `date`'s local day. A slot holds a LIST of plates in time
 * order; plates outside the day are ignored.
 */
export function classifyForDate(plates: Iterable<PlateLog>, date: EpochMs): DayBoardDay {
  const start = startOfLocalDay(date);
  const end = startOfNextLocalDay(date);
  const perSlot = new Map<MealSlot, PlateLog[]>(MEAL_SLOTS.map((s) => [s, []]));
  for (const plate of plates) {
    if (plate.loggedAtUtc < start || plate.loggedAtUtc >= end) continue;
    perSlot.get(mealSlotForHour(new Date(plate.loggedAtUtc).getHours()))?.push(plate);
  }
  return {
    date: start,
    slots: frozenList(
      MEAL_SLOTS.map((slot) => ({
        slot,
        plates: frozenList((perSlot.get(slot) ?? []).sort((a, b) => a.loggedAtUtc - b.loggedAtUtc)),
      })),
    ),
  };
}
