import type { EpochMs } from '../common';
import type { FoodEntry } from '../entities/food-entry';
import type { PlateLog } from '../entities/plate-log';
import { mealSlotForHour, type MealSlot } from '../day/meal-slot';
import { isSameLocalDay, startOfLocalDay } from './calendar-day';
import type { FoodEntryDraft } from './food-entry-draft';

/** The hour a meal usually happens at: where a copy lands when "now" is not in that meal. */
export const SLOT_TYPICAL_HOUR: Readonly<Record<MealSlot, number>> = Object.freeze({
  breakfast: 8,
  lunch: 12,
  dinner: 19,
  late: 23,
});

/** New drafts with the same food snapshot (nutrients included), grams and quantity; no ids. */
export function copyDrafts(
  entries: readonly (FoodEntry | FoodEntryDraft)[],
): readonly FoodEntryDraft[] {
  return entries.map((e) => ({
    databaseFood: {
      ...e.databaseFood,
      ...(e.databaseFood.nutrientsPer100g
        ? { nutrientsPer100g: { ...e.databaseFood.nutrientsPer100g } }
        : {}),
      ...(e.databaseFood.extra ? { extra: { ...e.databaseFood.extra } } : {}),
    },
    quantity: { ...e.quantity },
  }));
}

/**
 * When a copy lands: right now when `slot` is the meal that `now` falls in on that same day (the
 * "log this again" case), otherwise the slot's typical hour on `day`.
 */
export function instantForSlot(input: {
  readonly day: EpochMs;
  readonly slot: MealSlot;
  readonly now: EpochMs;
}): EpochMs {
  const { day, slot, now } = input;
  if (isSameLocalDay(day, now) && mealSlotForHour(new Date(now).getHours()) === slot) return now;
  const at = new Date(startOfLocalDay(day));
  at.setHours(SLOT_TYPICAL_HOUR[slot], 0, 0, 0);
  return at.getTime();
}

/**
 * The meals a copy can land in without ending up in the future: on today, the slots whose landing
 * time is not after `now` (the current meal lands at `now`, earlier ones at their usual hour); on
 * any other day, every candidate.
 */
export function slotsAvailable(input: {
  readonly day: EpochMs;
  readonly now: EpochMs;
  readonly candidates: readonly MealSlot[];
}): readonly MealSlot[] {
  return input.candidates.filter(
    (slot) => instantForSlot({ day: input.day, slot, now: input.now }) <= input.now,
  );
}

export interface PlannedPlate {
  readonly sourcePlateId: number;
  readonly slot: MealSlot;
  readonly loggedAtUtc: EpochMs;
  readonly entries: readonly FoodEntryDraft[];
  /** True when its clock time is later than `now` on the target day: copying it would make a future plate. */
  readonly later: boolean;
}

/**
 * Copy every plate of a day onto `targetDay` in time order, keeping each plate's clock time (so a
 * 19:30 dinner stays a dinner). A plate whose time on the target day is after `now` is marked
 * `later`: the app never creates a plate in the future. Plates without entries are left out.
 */
export function planDayCopy(
  plates: readonly PlateLog[],
  targetDay: EpochMs,
  now: EpochMs = Number.POSITIVE_INFINITY,
): readonly PlannedPlate[] {
  const start = startOfLocalDay(targetDay);
  const planned: PlannedPlate[] = [];
  for (const plate of plates) {
    if (plate.entries.length === 0) continue;
    const from = new Date(plate.loggedAtUtc);
    const to = new Date(start);
    to.setHours(from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds());
    planned.push({
      sourcePlateId: plate.id,
      slot: mealSlotForHour(from.getHours()),
      loggedAtUtc: to.getTime(),
      entries: copyDrafts(plate.entries),
      later: to.getTime() > now,
    });
  }
  return planned.sort((a, b) => a.loggedAtUtc - b.loggedAtUtc || a.sourcePlateId - b.sourcePlateId);
}
