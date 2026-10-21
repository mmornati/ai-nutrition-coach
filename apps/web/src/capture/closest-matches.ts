import {
  databaseFood,
  type DatabaseFood,
  type FoodCatalog,
  type FoodMatch,
  type RecognitionResult,
} from '@anc/core';
import { indexTokens } from '../catalog/ciqual-index';

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

/** A catalogue match must be at least this confident (a curated food, or a CIQUAL score >= ~0.67). */
export const NUTRIENT_MATCH_MIN_CONFIDENCE = 0.6;

/**
 * Whether `matchName` is a confident reading of `foodName`: every word of the recognised name
 * (accent-folded, plural-stemmed, glue words dropped) is a word, or the start of a word, of the
 * match. "rice" -> "Rice" yes; "chicken" -> "Chicken Breast" yes; "pizza" -> "Pizza margherita"
 * yes; "apple pie" -> "Apple" no (the pie is missing); "rice" -> "Rice pudding" yes, which is why
 * the catalogue's own score (it prefers short, generic names) must also clear the threshold.
 */
export function namesAgree(foodName: string, matchName: string): boolean {
  const wanted = indexTokens(foodName);
  if (wanted.length === 0) return false;
  const have = indexTokens(matchName);
  return wanted.every((w) => have.some((h) => h.startsWith(w)));
}

/**
 * Gives a food the model recognised the per-100 g nutrients of the best confident catalogue match
 * ({@link NUTRIENT_MATCH_MIN_CONFIDENCE} and {@link namesAgree}). A confident match REPLACES the
 * model's own values (a database beats a guess); the model's values stay, flagged
 * `extra.nutrientsEstimated`, only when no match is confident. Nutrients that already came from a
 * database are left alone. The food keeps its own name, reference, group and the model's grams.
 * A search that fails leaves the food as it was; nothing is ever invented.
 * A typed custom food is NOT run through this (the ranked list already offers the catalogue food).
 */
export async function enrichRecognition(
  recognition: RecognitionResult,
  catalog: FoodCatalog,
): Promise<RecognitionResult> {
  if (recognition.kind !== 'recognizedPlate') return recognition;
  const foods = await Promise.all(
    recognition.foods.map(async (rec) => {
      const enriched = await withNutrients(rec.databaseFood, catalog);
      return enriched === rec.databaseFood ? rec : { ...rec, databaseFood: enriched };
    }),
  );
  return { ...recognition, foods };
}

async function withNutrients(food: DatabaseFood, catalog: FoodCatalog): Promise<DatabaseFood> {
  if (food.nutrientsPer100g !== undefined && food.extra?.nutrientsEstimated !== true) return food;
  try {
    const result = await catalog.search(food.displayName, { limit: 5 });
    if (result.kind !== 'rankedMatches') return food;
    for (const match of result.matches) {
      const nutrients = match.food.nutrientsPer100g;
      if (nutrients === undefined) continue;
      if (match.confidence < NUTRIENT_MATCH_MIN_CONFIDENCE) continue;
      if (!namesAgree(food.displayName, match.food.displayName)) continue;
      // The product information (grade, group) stays; the "estimated" flag goes with the guess.
      return databaseFood({
        ...food,
        nutrientsPer100g: nutrients,
        extra: {
          nutriscoreGrade: food.extra?.nutriscoreGrade,
          novaGroup: food.extra?.novaGroup,
        },
      });
    }
  } catch {
    // The catalogue is unavailable: the model's values (if any) stay, flagged as estimates.
  }
  return food;
}
