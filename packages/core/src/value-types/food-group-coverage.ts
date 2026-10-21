import type { FoodGroup } from '../entities/database-food';

/** The four quadrants of the balance arc, in arc order. `other` covers none. */
export const BALANCE_ARC_GROUPS: readonly FoodGroup[] = ['vegFruit', 'protein', 'starch', 'dairy'];

/** Which quadrants have a food in them. Used as "which lines stopped here"; the app never invents a score from it. */
export function balanceCoverage(groups: Iterable<FoodGroup>): readonly boolean[] {
  const present = new Set(groups);
  return BALANCE_ARC_GROUPS.map((g) => present.has(g));
}
