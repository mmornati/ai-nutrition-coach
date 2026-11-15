/**
 * A custom food the person types, optionally with its weight and nutrition so it counts in the
 * totals (docs/adr/0006). Pure: strings in, a draft or one calm issue out; the form words the issue.
 *
 *   per 100 g      "Weight eaten" + values per 100 g  -> `grams` = what was eaten, values stored as typed
 *   per serving    "Serving weight" + values per serving -> values converted to per 100 g by the
 *                  serving weight; the entry is ONE serving that weighs that much
 *
 * Nothing but the name is required: a name alone logs `~1 serving` with no weight and no numbers
 * (it is then listed as "not counted" and can be completed later). Values without a weight are
 * refused, because without a weight they could not count and would look as if they did.
 */
import {
  databaseFood,
  gramsQuantity,
  type DatabaseFood,
  type FoodEntryDraft,
  type NutrientKey,
  type Nutrients,
  type QuantityRange,
} from '@anc/core';
import { formatWeight } from '../components/nutrition/format';
import { parseGrams } from '../components/sheets/QuantityPicker';
import { manualFood, oneServing } from '../components/sheets/foods';

export type CustomBasis = 'per100g' | 'perServing';

/** The optional nutrient fields, in form order. */
export const CUSTOM_NUTRIENT_FIELDS = [
  'energyKcal',
  'protein',
  'carbohydrate',
  'sugars',
  'fat',
  'saturatedFat',
  'fibre',
  'salt',
] as const satisfies readonly NutrientKey[];

export type CustomNutrientField = (typeof CUSTOM_NUTRIENT_FIELDS)[number];

export interface CustomFoodInput {
  readonly name: string;
  readonly basis: CustomBasis;
  /** Per 100 g: the weight eaten. Per serving: the weight of one serving. */
  readonly grams: string;
  readonly values: Readonly<Partial<Record<CustomNutrientField, string>>>;
}

export const EMPTY_CUSTOM_FOOD: CustomFoodInput = Object.freeze({
  name: '',
  basis: 'per100g',
  grams: '',
  values: Object.freeze({}),
});

/** Why the form cannot be used yet. `field` is the one to point at. */
export type CustomFoodIssue =
  | { readonly kind: 'name' }
  | { readonly kind: 'grams' }
  /** Nutrition was typed but there is no weight to count it against. */
  | { readonly kind: 'needsGrams' }
  | { readonly kind: 'value'; readonly field: CustomNutrientField }
  /** More than a food can hold per 100 g (900 kcal, 100 g of anything else). */
  | { readonly kind: 'tooHigh'; readonly field: CustomNutrientField }
  | { readonly kind: 'sugars' }
  | { readonly kind: 'saturates' }
  /** Protein, carbohydrate, fat, fibre and salt together weigh more than 100 g per 100 g. */
  | { readonly kind: 'macros' };

export type CustomFoodResult =
  | { readonly kind: 'ok'; readonly draft: FoodEntryDraft; readonly counts: boolean }
  | { readonly kind: 'invalid'; readonly issue: CustomFoodIssue };

/** Per 100 g ceilings, the same as the store's sanitiser (a pure fat is about 900 kcal). */
const CEILING: Readonly<Record<CustomNutrientField, number>> = {
  energyKcal: 900,
  protein: 100,
  carbohydrate: 100,
  sugars: 100,
  fat: 100,
  saturatedFat: 100,
  fibre: 100,
  salt: 100,
};

/**
 * A non-negative number, comma or dot; `null` for anything else. The empty string is `'empty'`.
 * "1,200" is refused: it is a thousands separator in English and 1.2 in French, and the parser
 * has no locale, so a guess would silently store the wrong amount. The person types "1200" or
 * "1.2" and means it.
 */
export function parseAmount(text: string): number | 'empty' | null {
  const raw = text.trim();
  if (/^\d{1,3},\d{3}$/.test(raw)) return null;
  const t = raw.replace(',', '.');
  if (t === '') return 'empty';
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** The fields whose grams cannot add up to more than 100 g per 100 g of food. */
const MASS_FIELDS = [
  'protein',
  'carbohydrate',
  'fat',
  'fibre',
  'salt',
] as const satisfies readonly CustomNutrientField[];

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export function parseCustomFood(input: CustomFoodInput): CustomFoodResult {
  const name = input.name.trim();
  if (name.length === 0) return { kind: 'invalid', issue: { kind: 'name' } };

  const typed: Partial<Record<CustomNutrientField, number>> = {};
  for (const field of CUSTOM_NUTRIENT_FIELDS) {
    const parsed = parseAmount(input.values[field] ?? '');
    if (parsed === 'empty') continue;
    if (parsed === null) return { kind: 'invalid', issue: { kind: 'value', field } };
    typed[field] = parsed;
  }
  const hasValues = Object.keys(typed).length > 0;

  const gramsText = input.grams.trim();
  const grams = gramsText === '' ? null : parseGrams(gramsText);
  if (gramsText !== '' && grams === null) return { kind: 'invalid', issue: { kind: 'grams' } };
  if (hasValues && grams === null) return { kind: 'invalid', issue: { kind: 'needsGrams' } };

  // Nothing but a name: the original `~1 serving`, unweighed and unmeasured.
  if (grams === null) {
    return {
      kind: 'ok',
      draft: { databaseFood: manualFood(name), quantity: oneServing() },
      counts: false,
    };
  }

  const scale = input.basis === 'perServing' ? 100 / grams : 1;
  const per100: Partial<Record<NutrientKey, number>> = {};
  for (const field of CUSTOM_NUTRIENT_FIELDS) {
    const value = typed[field];
    if (value === undefined) continue;
    const converted = round3(value * scale);
    if (converted > CEILING[field]) {
      return { kind: 'invalid', issue: { kind: 'tooHigh', field } };
    }
    per100[field] = converted;
  }
  if (
    per100.sugars !== undefined &&
    per100.carbohydrate !== undefined &&
    per100.sugars > per100.carbohydrate
  ) {
    return { kind: 'invalid', issue: { kind: 'sugars' } };
  }
  if (
    per100.saturatedFat !== undefined &&
    per100.fat !== undefined &&
    per100.saturatedFat > per100.fat
  ) {
    return { kind: 'invalid', issue: { kind: 'saturates' } };
  }

  // Per 100 g of food there are at most 100 g of everything in it: kJ typed as kcal is caught by
  // the energy ceiling above, a per-serving value typed as per 100 g (or the reverse) here.
  const macroGrams = MASS_FIELDS.reduce((sum, field) => sum + (per100[field] ?? 0), 0);
  if (round3(macroGrams) > 100) return { kind: 'invalid', issue: { kind: 'macros' } };

  const nutrients: Nutrients | undefined = hasValues ? per100 : undefined;
  const base = manualFood(name);
  const food: DatabaseFood = databaseFood({
    sourceRef: base.sourceRef,
    displayName: base.displayName,
    source: 'manual',
    foodGroup: base.foodGroup,
    nutrientsPer100g: nutrients,
  });
  const quantity: QuantityRange =
    input.basis === 'perServing'
      ? { ...oneServing(), grams, gramsEstimated: false }
      : gramsQuantity(grams, { displayLabel: formatWeight(grams, false) });
  return {
    kind: 'ok',
    draft: { databaseFood: food, quantity },
    counts: nutrients !== undefined,
  };
}
