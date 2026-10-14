/** The slots a local day is divided into. Hours are local and cover all 24. */
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'late'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/**
 * breakfast 05-10, lunch 11-15, dinner 16-22, late 23-04. Total: every hour maps to exactly one
 * slot (out-of-range input wraps modulo 24).
 */
export function mealSlotForHour(hour: number): MealSlot {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h <= 10) return 'breakfast';
  if (h >= 11 && h <= 15) return 'lunch';
  if (h >= 16 && h <= 22) return 'dinner';
  return 'late';
}

/**
 * The three meals always render (an open dent when empty). `late` renders only when it holds a
 * plate: an empty late row would invite logging at night.
 */
export function isMealSlotAlwaysShown(slot: MealSlot): boolean {
  return slot !== 'late';
}
