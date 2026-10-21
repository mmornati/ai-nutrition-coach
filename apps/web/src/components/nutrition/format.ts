/**
 * How weights and nutrient values read in the person's language. Kcal are whole numbers; grams
 * are whole from 10 up and keep one decimal below ("5,4 g"). French groups thousands ("5 000 g"). Nothing here rounds toward a target.
 */
import {
  NUTRIENT_KEYS,
  type DatabaseFood,
  type NutrientKey,
  type Nutrients,
  type QuantityRange,
} from '@anc/core';
import { quantityLabel } from '../../catalog';
import { currentLocale, fill } from '../../i18n';
import { catalogueFor } from '../../i18n/catalogues';
import { perLocale, type Locale } from '../../i18n/locale';

// French groups thousands with a narrow no-break space, even four-digit ones ("5 000 g"); English
// keeps them plain ("5000 g").
const oneDecimal = perLocale(
  (tag, locale) =>
    new Intl.NumberFormat(tag, { maximumFractionDigits: 1, useGrouping: locale === 'fr' }),
);
const whole = perLocale(
  (tag, locale) =>
    new Intl.NumberFormat(tag, { maximumFractionDigits: 0, useGrouping: locale === 'fr' }),
);

/** A gram amount: one decimal under 10, whole from 10. */
export function formatAmount(value: number, locale: Locale = currentLocale()): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded < 10 ? oneDecimal(locale).format(rounded) : whole(locale).format(rounded);
}

/** "150 g", or "≈150 g" when the weight is a guess. */
export function formatWeight(
  grams: number,
  approximate: boolean,
  locale: Locale = currentLocale(),
): string {
  const t = catalogueFor(locale).nutrition;
  return fill(approximate ? t.weightApprox : t.weight, { value: formatAmount(grams, locale) });
}

/** A whole number in the person's language: "1 200" in French (narrow no-break space). */
export function formatWhole(value: number, locale: Locale = currentLocale()): string {
  return whole(locale).format(value);
}

/** A nutrient value with its unit: "210 kcal", "9 g"; "~" in front when estimated. */
export function formatNutrient(
  key: NutrientKey,
  value: number,
  estimated: boolean,
  locale: Locale = currentLocale(),
): string {
  const t = catalogueFor(locale).nutrition;
  const text =
    key === 'energyKcal'
      ? fill(t.valueKcal, { value: whole(locale).format(value) })
      : fill(t.valueGrams, { value: formatAmount(value, locale) });
  return estimated ? fill(t.estimatedValue, { value: text }) : text;
}

/** The reference intake with its unit: "2000 kcal", "50 g". */
export function formatReference(
  key: NutrientKey,
  reference: number,
  locale: Locale = currentLocale(),
): string {
  return formatNutrient(key, reference, false, locale);
}

/** Per-100 g nutrients scaled to a weight. A missing key stays missing. */
export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  const out: Partial<Record<NutrientKey, number>> = {};
  for (const key of NUTRIENT_KEYS) {
    const value = per100g[key];
    if (value !== undefined) out[key] = (value * grams) / 100;
  }
  return out;
}

/**
 * The one-line preview for a food at a weight: "≈ 210 kcal · 9 g protein · 2 g sugars". Only the
 * values the food has; `null` when it has none of the three or the weight is unknown.
 */
export function previewLine(
  food: DatabaseFood | undefined,
  grams: number | undefined,
  locale: Locale = currentLocale(),
): string | null {
  if (food?.nutrientsPer100g === undefined || grams === undefined) return null;
  const t = catalogueFor(locale).nutrition;
  const scaled = scaleNutrients(food.nutrientsPer100g, grams);
  const parts: string[] = [];
  if (scaled.energyKcal !== undefined) {
    parts.push(fill(t.previewEnergy, { value: whole(locale).format(scaled.energyKcal) }));
  }
  if (scaled.protein !== undefined) {
    parts.push(fill(t.previewProtein, { value: formatAmount(scaled.protein, locale) }));
  }
  if (scaled.sugars !== undefined) {
    parts.push(fill(t.previewSugars, { value: formatAmount(scaled.sugars, locale) }));
  }
  return parts.length === 0 ? null : fill(t.previewLead, { parts: parts.join(' · ') });
}

/**
 * What a logged quantity reads as: the portion words with the weight when it is known
 * ("~1 fist · ≈150 g"), or just the weight for a weighed amount ("150 g").
 */
export function entryQuantityText(q: QuantityRange, locale: Locale = currentLocale()): string {
  if (q.grams === undefined) return quantityLabel(q, locale);
  const weight = formatWeight(q.grams, q.gramsEstimated === true, locale);
  return q.unit === 'g' ? weight : `${quantityLabel(q, locale)} · ${weight}`;
}
