import type { FoodCatalog, FoodMatch, RecognitionResult } from '@anc/core';

/** How many closest matches the sheet offers at most. */
export const MAX_CLOSEST_MATCHES = 8;
/** How many recognised foods are looked up in the catalog, and how many hits each contributes. */
const RECOGNISED_LOOKUPS = 3;
const PER_FOOD_LIMIT = 4;

/**
 * The "closest matches" row of the photo sheet:
 *  1. catalog matches for each food the rung recognised (a few each);
 *  2. then the foods the person logged in the last week, newest first.
 * Duplicates (same `sourceRef`) are dropped. Never throws; an error in either source just leaves
 * that part out, so a failed or empty recognition still offers the recent foods.
 */
export async function closestMatches(
  recognition: RecognitionResult,
  catalog: FoodCatalog,
  recentMatches?: () => Promise<readonly FoodMatch[]>,
): Promise<readonly FoodMatch[]> {
  const out: FoodMatch[] = [];
  const seen = new Set<string>();
  const add = (m: FoodMatch): void => {
    if (out.length >= MAX_CLOSEST_MATCHES) return;
    if (!seen.has(m.food.sourceRef)) {
      seen.add(m.food.sourceRef);
      out.push(m);
    }
  };

  if (recognition.kind === 'recognizedPlate') {
    for (const rec of recognition.foods.slice(0, RECOGNISED_LOOKUPS)) {
      try {
        const result = await catalog.search(rec.databaseFood.displayName, {
          limit: PER_FOOD_LIMIT,
        });
        if (result.kind === 'rankedMatches') result.matches.forEach(add);
      } catch {
        // This source is unavailable; the others still count.
      }
    }
  }

  if (recentMatches) {
    try {
      (await recentMatches()).forEach(add);
    } catch {
      // No history to offer.
    }
  }
  return out;
}
