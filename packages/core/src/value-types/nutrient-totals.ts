import type { FoodEntry } from '../entities/food-entry';
import type { PlateLog } from '../entities/plate-log';
import { NUTRIENT_KEYS, type Nutrients, type NutrientKey } from './nutrients';

/**
 * How much of a nutrient may be missing before its total is shown as "at least". A nutrient is
 * "uncovered" for an entry that does not know it; the uncovered share is the weight of those
 * entries (their energy in kcal, or their grams when the energy is unknown) over the weight of all
 * weighed entries. Public food tables lack sugars, fibre or salt for a few percent of rows, and a
 * pinch of herbs without fibre data should not turn a whole day's fibre into "at least". Above
 * this share the figure is honestly flagged and the weekly rules stay silent about it. Foods with
 * no weight are never part of the share: they always keep energy "at least" and the "not
 * counted" line, whatever this value is.
 */
export const MAX_UNCOVERED_SHARE = 0.1;

export interface NutrientTotals {
  /** A key is present only if at least one counted entry knows it. Full precision, unrounded. */
  readonly totals: Nutrients;
  /** Entries that contributed (grams and per-100 g nutrients both known). */
  readonly entriesCounted: number;
  readonly entriesTotal: number;
  /**
   * Per nutrient: how many entries of the set do NOT contribute to it (no weight, no nutrition
   * data at all, or that one nutrient unknown). A key is present only when the count is above
   * zero; absent means every entry contributed, so the total is complete for that nutrient.
   */
  readonly gaps: Readonly<Partial<Record<NutrientKey, number>>>;
  /**
   * Per nutrient: share (0 to 1) of the weighed foods' weight that does not know it, see
   * `MAX_UNCOVERED_SHARE`. A key is present only when above zero.
   */
  readonly uncoveredShare: Readonly<Partial<Record<NutrientKey, number>>>;
  /** Entries with no usable weight at all: always left out of every total. */
  readonly unweighed: number;
  /** The entries left out of every total (no weight, or no nutrition data), in order. */
  readonly uncounted: readonly FoodEntry[];
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

/** The weight of an entry for the uncovered share: its energy, else its grams; undefined if unweighed. */
function entryWeight(entry: FoodEntry): number | undefined {
  const grams = entry.quantity.grams;
  if (grams === undefined || !Number.isFinite(grams) || grams <= 0) return undefined;
  const kcal = entry.databaseFood.nutrientsPer100g?.energyKcal;
  return kcal !== undefined && kcal > 0 ? (kcal * grams) / 100 : grams;
}

export function sumNutrients(entries: readonly FoodEntry[]): NutrientTotals {
  const totals: Partial<Record<NutrientKey, number>> = {};
  const gaps: Partial<Record<NutrientKey, number>> = {};
  const uncoveredWeight: Partial<Record<NutrientKey, number>> = {};
  const uncounted: FoodEntry[] = [];
  let counted = 0;
  let unweighed = 0;
  let weighedTotal = 0;
  let estimated = false;
  for (const entry of entries) {
    const n = entryNutrients(entry);
    const weight = entryWeight(entry);
    if (weight === undefined) unweighed++;
    else weighedTotal += weight;
    if (!n) {
      uncounted.push(entry);
      for (const key of NUTRIENT_KEYS) {
        gaps[key] = (gaps[key] ?? 0) + 1;
        if (weight !== undefined) uncoveredWeight[key] = (uncoveredWeight[key] ?? 0) + weight;
      }
      continue;
    }
    for (const key of NUTRIENT_KEYS) {
      if (n[key] === undefined) {
        gaps[key] = (gaps[key] ?? 0) + 1;
        if (weight !== undefined) uncoveredWeight[key] = (uncoveredWeight[key] ?? 0) + weight;
      }
    }
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
  const uncoveredShare: Partial<Record<NutrientKey, number>> = {};
  for (const key of NUTRIENT_KEYS) {
    const lost = uncoveredWeight[key] ?? 0;
    if (lost > 0 && weighedTotal > 0) uncoveredShare[key] = lost / weighedTotal;
  }
  return {
    totals: Object.freeze(totals),
    entriesCounted: counted,
    entriesTotal: entries.length,
    gaps: Object.freeze(gaps),
    uncoveredShare: Object.freeze(uncoveredShare),
    unweighed,
    uncounted: Object.freeze(uncounted),
    estimated,
  };
}

/**
 * True when the total of `key` should read "at least": its uncovered share is above
 * `MAX_UNCOVERED_SHARE`, or (energy only) a food has no weight so it is in no total at all.
 */
export const isTotalPartial = (
  data: Pick<NutrientTotals, 'uncoveredShare' | 'unweighed'>,
  key: NutrientKey,
): boolean =>
  (key === 'energyKcal' && data.unweighed > 0) ||
  (data.uncoveredShare[key] ?? 0) > MAX_UNCOVERED_SHARE;

export const isPartial = (totals: NutrientTotals, key: NutrientKey): boolean =>
  isTotalPartial(totals, key);

export function plateNutrients(plate: PlateLog): NutrientTotals {
  return sumNutrients(plate.entries);
}

export function dayNutrients(plates: readonly PlateLog[]): NutrientTotals {
  return sumNutrients(plates.flatMap((p) => p.entries));
}
