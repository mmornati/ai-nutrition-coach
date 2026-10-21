import { databaseFood, type DatabaseFood, type FoodGroup } from '../entities/database-food';
import type { Recipe } from '../entities/saved-meal';
import { sanitizeNutrients, NUTRIENT_KEYS, type NutrientKey, type Nutrients } from './nutrients';
import type { FoodEntryDraft } from './food-entry-draft';
import { MAX_GRAMS } from './quantity-range';

export const MAX_SERVINGS = 100;
/** A pot of stew can outweigh one plate: the cooked weight of a whole dish goes higher. */
export const MAX_COOKED_WEIGHT_GRAMS = 20_000;
export const MAX_INGREDIENTS = 40;
/** A cooked weight outside this range of the raw ingredient sum is more likely a typo than cooking. */
export const COOKED_WEIGHT_MIN_RATIO = 0.2;
export const COOKED_WEIGHT_MAX_RATIO = 3;
/** A food group is kept on a recipe when it holds at least this share of the weight. */
export const GROUP_SHARE_MIN = 0.15;

/** The first reason a recipe cannot be saved. */
export type RecipeProblem =
  | 'noIngredients'
  | 'tooManyIngredients'
  | 'ingredientWithoutGrams'
  | 'badServings'
  | 'badCookedWeight'
  | 'cookedWeightImplausible'
  | 'servingTooHeavy';

export interface RecipeNutrition {
  /** Sum of the ingredients' weights (raw, as listed). */
  readonly ingredientGrams: number;
  /** What the per-100 g and per-serving figures are measured against: cooked weight, else the raw sum. */
  readonly basisGrams: number;
  readonly servings: number;
  readonly perServingGrams: number;
  /** Whole-recipe nutrients: only the keys at least one ingredient knows, never invented. */
  readonly totals: Nutrients;
  readonly perServing: Nutrients;
  /** Per 100 g of the cooked dish (or of the raw sum without a cooked weight). */
  readonly per100g: Nutrients | undefined;
  readonly ingredientsCounted: number;
  readonly ingredientsTotal: number;
  /**
   * True when something is missing from the figures: an ingredient with no nutrients, or a
   * nutrient some ingredients do not know. The totals then read low, so they are only an estimate.
   */
  readonly partial: boolean;
  /** True when any ingredient's weight or nutrients are themselves a guess (a preset, an AI reading). */
  readonly anyEstimated: boolean;
  /** False when no cooked weight was given: the weight basis is the raw sum. */
  readonly cookedWeightKnown: boolean;
}

interface RecipeInput {
  readonly ingredients: readonly FoodEntryDraft[];
  readonly servings: number;
  readonly cookedWeightGrams?: number | undefined;
}

const gramsOf = (draft: FoodEntryDraft): number | undefined => {
  const g = draft.quantity.grams;
  return g !== undefined && Number.isFinite(g) && g > 0 ? g : undefined;
};

/** Why `input` cannot be a recipe, or `null` when it can. */
export function recipeProblem(input: RecipeInput): RecipeProblem | null {
  if (input.ingredients.length === 0) return 'noIngredients';
  if (input.ingredients.length > MAX_INGREDIENTS) return 'tooManyIngredients';
  if (input.ingredients.some((i) => (gramsOf(i) ?? 0) === 0 || (gramsOf(i) ?? 0) > MAX_GRAMS)) {
    return 'ingredientWithoutGrams';
  }
  if (!Number.isInteger(input.servings) || input.servings < 1 || input.servings > MAX_SERVINGS) {
    return 'badServings';
  }
  const cooked = input.cookedWeightGrams;
  if (
    cooked !== undefined &&
    (!Number.isFinite(cooked) || cooked <= 0 || cooked > MAX_COOKED_WEIGHT_GRAMS)
  ) {
    return 'badCookedWeight';
  }
  const raw = input.ingredients.reduce((sum, i) => sum + (gramsOf(i) ?? 0), 0);
  if (
    cooked !== undefined &&
    (cooked < raw * COOKED_WEIGHT_MIN_RATIO || cooked > raw * COOKED_WEIGHT_MAX_RATIO)
  ) {
    return 'cookedWeightImplausible';
  }
  const basis = cooked ?? raw;
  if (basis / input.servings > MAX_GRAMS) return 'servingTooHeavy';
  return null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The nutrition of a recipe, purely from its ingredients: whole = sum of (per 100 g x grams / 100),
 * per serving = whole / servings, per 100 g = whole / basis x 100 where the basis is the cooked
 * weight when given (cooking changes water, so the raw sum is only the fallback and the result is
 * then an estimate). An ingredient with unknown nutrients adds nothing and marks the result
 * `partial`; it is never counted as zero silently. Call `recipeProblem` first: an invalid input
 * gives zero weights here.
 */
export function computeRecipe(input: RecipeInput): RecipeNutrition {
  const totals: Partial<Record<NutrientKey, number>> = {};
  let ingredientGrams = 0;
  let counted = 0;
  const keysSeen = new Set<NutrientKey>();
  const perIngredient: Set<NutrientKey>[] = [];
  for (const ingredient of input.ingredients) {
    const grams = gramsOf(ingredient) ?? 0;
    ingredientGrams += grams;
    const per100 = ingredient.databaseFood.nutrientsPer100g;
    const known = new Set<NutrientKey>();
    if (per100 !== undefined) {
      for (const key of NUTRIENT_KEYS) {
        const value = per100[key];
        if (value === undefined) continue;
        totals[key] = (totals[key] ?? 0) + (value * grams) / 100;
        known.add(key);
        keysSeen.add(key);
      }
    }
    if (known.size > 0) counted++;
    perIngredient.push(known);
  }
  let partial =
    counted < input.ingredients.length ||
    perIngredient.some((known) => [...keysSeen].some((key) => !known.has(key)));
  const anyEstimated = input.ingredients.some(
    (i) => i.quantity.gramsEstimated === true || i.databaseFood.extra?.nutrientsEstimated === true,
  );

  const servings = input.servings >= 1 ? input.servings : 1;
  const cooked = input.cookedWeightGrams;
  const cookedWeightKnown = cooked !== undefined && cooked > 0;
  const basisGrams = cookedWeightKnown ? cooked : ingredientGrams;
  const scaled = (factor: number): Nutrients => {
    const out: Partial<Record<NutrientKey, number>> = {};
    for (const key of NUTRIENT_KEYS) {
      const value = totals[key];
      if (value !== undefined) out[key] = round2(value * factor);
    }
    return Object.freeze(out);
  };

  const rawPer100 = basisGrams > 0 ? scaled(100 / basisGrams) : undefined;
  const per100g = rawPer100 === undefined ? undefined : sanitizeNutrients(rawPer100);
  // A value the plausibility caps dropped is unknown now, not zero: say the figures are partial.
  if (
    rawPer100 !== undefined &&
    Object.keys(rawPer100).some((k) => per100g?.[k as NutrientKey] === undefined)
  ) {
    partial = true;
  }

  return {
    ingredientGrams: round2(ingredientGrams),
    basisGrams: round2(basisGrams),
    servings,
    perServingGrams: round2(basisGrams / servings),
    totals: scaled(1),
    perServing: scaled(1 / servings),
    per100g,
    ingredientsCounted: counted,
    ingredientsTotal: input.ingredients.length,
    partial,
    anyEstimated,
    cookedWeightKnown,
  };
}

function groupWeights(ingredients: readonly FoodEntryDraft[]): Map<FoodGroup, number> {
  const weight = new Map<FoodGroup, number>();
  for (const i of ingredients) {
    const group = i.databaseFood.foodGroup;
    weight.set(group, (weight.get(group) ?? 0) + (gramsOf(i) ?? 0));
  }
  return weight;
}

/** The food group that holds the most weight in the recipe (`other` only when nothing else does). */
export function recipeFoodGroup(ingredients: readonly FoodEntryDraft[]): FoodGroup {
  let best: FoodGroup = 'other';
  let bestWeight = 0;
  for (const [group, grams] of groupWeights(ingredients)) {
    if (group === 'other') continue;
    if (grams > bestWeight) {
      best = group;
      bestWeight = grams;
    }
  }
  return best;
}

/**
 * The groups, heaviest first, that each hold at least `GROUP_SHARE_MIN` of the recipe's weight
 * (never `other`): the lines a mixed dish really stops at.
 */
export function recipeFoodGroups(ingredients: readonly FoodEntryDraft[]): readonly FoodGroup[] {
  const weights = groupWeights(ingredients);
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  return [...weights]
    .filter(([group, grams]) => group !== 'other' && grams / total >= GROUP_SHARE_MIN)
    .sort((a, b) => b[1] - a[1])
    .map(([group]) => group);
}

/** `recipe:<id>`: the stable reference a plate keeps for a recipe's food. */
export const recipeSourceRef = (id: number): string => `recipe:${id}`;

/**
 * A recipe as a food: `source: 'recipe'`, per-100 g nutrients of the dish (flagged as an estimate
 * when there is no cooked weight or an ingredient is missing nutrients). Logged entries snapshot
 * it, so deleting the recipe later never changes a plate.
 */
export function recipeAsFood(recipe: Recipe): DatabaseFood {
  const n = computeRecipe(recipe);
  const estimated = n.partial || !n.cookedWeightKnown || n.anyEstimated;
  const groups = recipeFoodGroups(recipe.ingredients);
  return databaseFood({
    sourceRef: recipeSourceRef(recipe.id),
    displayName: recipe.name,
    source: 'recipe',
    foodGroup: recipeFoodGroup(recipe.ingredients),
    ...(n.per100g ? { nutrientsPer100g: n.per100g } : {}),
    ...(estimated || groups.length > 1
      ? {
          extra: {
            ...(estimated ? { nutrientsEstimated: true } : {}),
            ...(groups.length > 1 ? { groups } : {}),
          },
        }
      : {}),
  });
}
