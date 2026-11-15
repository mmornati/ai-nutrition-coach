// BMI and waist-to-height ratio (docs/adr/0008). Plain numbers, and the published reference ranges
// kept as DATA so the screens can write them out as text next to the number. They are never turned
// into a label for the person, never colour-coded, and never used to score anything. Pure.

import { HEIGHT_RANGE_CM, roundMeasurement } from '../entities/body-measurement';

/** BMI = kg / m^2, to one decimal. `null` without a valid weight and height. */
export function bodyMassIndex(
  weightKg: number | undefined,
  heightCm: number | undefined,
): number | null {
  if (weightKg === undefined || heightCm === undefined) return null;
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (
    !Number.isFinite(heightCm) ||
    heightCm < HEIGHT_RANGE_CM.min ||
    heightCm > HEIGHT_RANGE_CM.max
  ) {
    return null;
  }
  const m = heightCm / 100;
  return roundMeasurement(weightKg / (m * m));
}

/** Waist-to-height ratio, two decimals. `null` without a valid waist and height. */
export function waistToHeightRatio(
  waistCm: number | undefined,
  heightCm: number | undefined,
): number | null {
  if (waistCm === undefined || heightCm === undefined) return null;
  if (!Number.isFinite(waistCm) || waistCm <= 0) return null;
  if (
    !Number.isFinite(heightCm) ||
    heightCm < HEIGHT_RANGE_CM.min ||
    heightCm > HEIGHT_RANGE_CM.max
  ) {
    return null;
  }
  return Math.round((waistCm / heightCm) * 100) / 100;
}

/**
 * One published range: `from` inclusive, `to` exclusive (`null` is open-ended). `id` names the
 * range in the copy; it is the range that is named, never the person.
 */
export interface ReferenceRange {
  readonly id: string;
  readonly from: number | null;
  readonly to: number | null;
}

/**
 * WHO adult BMI ranges (WHO 2000, "Obesity: preventing and managing the global epidemic";
 * NICE NG246 and CDC use the same cut-offs): under 18.5, 18.5-24.9, 25-29.9, 30 and above.
 */
export const WHO_BMI_RANGES: readonly ReferenceRange[] = Object.freeze([
  Object.freeze({ id: 'under', from: null, to: 18.5 }),
  Object.freeze({ id: 'healthy', from: 18.5, to: 25 }),
  Object.freeze({ id: 'over', from: 25, to: 30 }),
  Object.freeze({ id: 'obesity', from: 30, to: null }),
]);

/**
 * Lower cut-offs recommended for people of South Asian, Chinese, other Asian, Middle Eastern, Black
 * African or African-Caribbean background (WHO expert consultation 2004; NICE NG246): the
 * "increased risk" range starts at 23 and the "high risk" range at 27.5.
 */
export const LOWER_BMI_CUTOFFS = Object.freeze({ increasedRisk: 23, highRisk: 27.5 });

/**
 * Waist-to-height ratio ranges (NICE NG246): 0.4-0.49, 0.5-0.59, 0.6 and above. Meaningful for
 * adults with a BMI under 35 only.
 */
export const WHTR_RANGES: readonly ReferenceRange[] = Object.freeze([
  Object.freeze({ id: 'low', from: 0.4, to: 0.5 }),
  Object.freeze({ id: 'raised', from: 0.5, to: 0.6 }),
  Object.freeze({ id: 'high', from: 0.6, to: null }),
]);

/** The BMI above which the waist-to-height ratio is not a useful extra measure (NICE NG246). */
export const WHTR_MAX_BMI = 35;

/** Whether the ratio is meaningful: BMI unknown counts as meaningful, 35 or more does not. */
export const whtrApplies = (bmi: number | null): boolean => bmi === null || bmi < WHTR_MAX_BMI;

/** The reference range a value falls in (for placing a number next to the ranges). */
export function rangeOf(ranges: readonly ReferenceRange[], value: number): ReferenceRange | null {
  return (
    ranges.find((r) => (r.from === null || value >= r.from) && (r.to === null || value < r.to)) ??
    null
  );
}
