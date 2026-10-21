import type { FoodEntry } from '../entities/food-entry';
import type { PlateLog } from '../entities/plate-log';
import { NUTRIENT_KEYS, type Nutrients, type NutrientKey } from './nutrients';

export interface NutrientTotals {
  /** A key is present only if at least one counted entry knows it. Full precision, unrounded. */
  readonly totals: Nutrients;
  /** Entries that contributed (grams and per-100 g nutrients both known). */
  readonly entriesCounted: number;
  readonly entriesTotal: number;
  /** True when any counted entry's weight was a preset / AI / serving guess, or its nutrients came from a model. */
  readonly estimated: boolean;
}

/** per 100 g x grams / 100; `undefined` when the weight or the nutrients are unknown. */
export function entryNutrients(entry: FoodEntry): Nutrients | undefined {
  const grams = entry.quantity.grams;
  const per100 = entry.databaseFood.nutrientsPer100g;
  if (grams === undefined || !Number.isFinite(grams) || grams <= 0 || per100 === undefined) {
    return undefined;
  }
  const out: Partial<Record<NutrientKey, number>> = {};
  for (const key of NUTRIENT_KEYS) {
    const value = per100[key];
    if (value !== undefined) out[key] = (value * grams) / 100;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function sumNutrients(entries: readonly FoodEntry[]): NutrientTotals {
  const totals: Partial<Record<NutrientKey, number>> = {};
  let counted = 0;
  let estimated = false;
  for (const entry of entries) {
    const n = entryNutrients(entry);
    if (!n) continue;
    counted++;
    if (
      entry.quantity.gramsEstimated === true ||
      entry.databaseFood.extra?.nutrientsEstimated === true
    ) {
      estimated = true;
    }
    for (const key of NUTRIENT_KEYS) {
      const value = n[key];
      if (value !== undefined) totals[key] = (totals[key] ?? 0) + value;
    }
  }
  return {
    totals: Object.freeze(totals),
    entriesCounted: counted,
    entriesTotal: entries.length,
    estimated,
  };
}

export function plateNutrients(plate: PlateLog): NutrientTotals {
  return sumNutrients(plate.entries);
}

export function dayNutrients(plates: readonly PlateLog[]): NutrientTotals {
  return sumNutrients(plates.flatMap((p) => p.entries));
}
