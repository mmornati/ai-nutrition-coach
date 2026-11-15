/**
 * The meals a plate can belong to. Hours are local and cover all 24 for the slots derived from the
 * time; `snack` exists only by choice (a plate filed under it, schema v5), never derived.
 */
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'late'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/**
 * The slots a plate falls into when the person did not choose one: breakfast 05-10, lunch 11-15, dinner 16-22, late 23-04. Total: every hour maps to exactly one
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
 * The three meals always render (an open dent when empty). `late` and `snack` render only when
 * they hold a plate: an empty late row would invite logging at night, and an empty snack row would
 * invite one.
 */
export function isMealSlotAlwaysShown(slot: MealSlot): boolean {
  return slot !== 'late' && slot !== 'snack';
}
