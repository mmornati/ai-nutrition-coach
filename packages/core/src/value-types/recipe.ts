import { databaseFood, type DatabaseFood, type FoodGroup } from '../entities/database-food';
import type { Recipe } from '../entities/saved-meal';
import { sanitizeNutrients, NUTRIENT_KEYS, type NutrientKey, type Nutrients } from './nutrients';
import type { FoodEntryDraft } from './food-entry-draft';
import { MAX_GRAMS } from './quantity-range';

export const MAX_SERVINGS = 100;
/** A pot of stew can outweigh one plate: the cooked weight of a whole dish goes higher. */
export const MAX_COOKED_WEIGHT_GRAMS = 20_000;
export const MAX_INGREDIENTS = 40;

/** The first reason a recipe cannot be saved. */
export type RecipeProblem =
  | 'noIngredients'
  | 'tooManyIngredients'
  | 'ingredientWithoutGrams'
  | 'badServings'
  | 'badCookedWeight'
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
  const basis = cooked ?? input.ingredients.reduce((sum, i) => sum + (gramsOf(i) ?? 0), 0);
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
  const partial =
    counted < input.ingredients.length ||
    perIngredient.some((known) => [...keysSeen].some((key) => !known.has(key)));

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

  return {
    ingredientGrams: round2(ingredientGrams),
    basisGrams: round2(basisGrams),
    servings,
    perServingGrams: round2(basisGrams / servings),
    totals: scaled(1),
    perServing: scaled(1 / servings),
    per100g: basisGrams > 0 ? sanitizeNutrients(scaled(100 / basisGrams)) : undefined,
    ingredientsCounted: counted,
    ingredientsTotal: input.ingredients.length,
    partial,
    cookedWeightKnown,
  };
}

/** The food group that holds the most weight in the recipe (`other` only when nothing else does). */
export function recipeFoodGroup(ingredients: readonly FoodEntryDraft[]): FoodGroup {
  const weight = new Map<FoodGroup, number>();
  for (const i of ingredients) {
    const group = i.databaseFood.foodGroup;
    weight.set(group, (weight.get(group) ?? 0) + (gramsOf(i) ?? 0));
  }
  let best: FoodGroup = 'other';
  let bestWeight = 0;
  for (const [group, grams] of weight) {
    if (group === 'other') continue;
    if (grams > bestWeight) {
      best = group;
      bestWeight = grams;
    }
  }
  return best;
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
  const estimated = n.partial || !n.cookedWeightKnown;
  return databaseFood({
    sourceRef: recipeSourceRef(recipe.id),
    displayName: recipe.name,
    source: 'recipe',
    foodGroup: recipeFoodGroup(recipe.ingredients),
    ...(n.per100g ? { nutrientsPer100g: n.per100g } : {}),
    ...(estimated ? { extra: { nutrientsEstimated: true } } : {}),
  });
}
