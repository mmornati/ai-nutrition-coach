import { describe, expect, it } from 'vitest';
import {
  cleanSavedName,
  computeRecipe,
  databaseFood,
  recipeAsFood,
  recipeFoodGroup,
  recipeFoodGroups,
  sanitizeFoodExtra,
  recipeProblem,
  recipeSourceRef,
  type FoodEntryDraft,
  type FoodGroup,
  type Nutrients,
  type Recipe,
} from '../src/index';

function ingredient(
  name: string,
  grams: number | undefined,
  nutrients?: Nutrients,
  group: FoodGroup = 'other',
): FoodEntryDraft {
  return {
    databaseFood: databaseFood({
      sourceRef: `manual:${name}`,
      displayName: name,
      source: 'seed',
      foodGroup: group,
      ...(nutrients ? { nutrientsPer100g: nutrients } : {}),
    }),
    quantity: {
      low: grams ?? 1,
      high: grams ?? 1,
      unit: grams === undefined ? 'serving' : 'g',
      displayLabel: grams === undefined ? '~1 serving' : `${grams} g`,
      ...(grams === undefined ? {} : { grams }),
    },
  };
}

const rice = ingredient('rice', 200, { energyKcal: 130, protein: 3, carbohydrate: 28 }, 'starch');
const chicken = ingredient('chicken', 300, { energyKcal: 165, protein: 31 }, 'protein');

describe('computeRecipe', () => {
  it('sums per-100 g x grams / 100, divides by servings, and uses the cooked weight for per 100 g', () => {
    const n = computeRecipe({ ingredients: [rice, chicken], servings: 4, cookedWeightGrams: 800 });
    // rice 260 kcal + chicken 495 kcal
    expect(n.totals.energyKcal).toBe(755);
    expect(n.totals.protein).toBe(99);
    expect(n.perServing.energyKcal).toBe(188.75);
    expect(n.perServing.protein).toBe(24.75);
    expect(n.perServingGrams).toBe(200);
    expect(n.basisGrams).toBe(800);
    expect(n.ingredientGrams).toBe(500);
    expect(n.per100g?.energyKcal).toBe(94.38);
    expect(n.cookedWeightKnown).toBe(true);
  });

  it('falls back to the raw ingredient weight, and says so, without a cooked weight', () => {
    const n = computeRecipe({ ingredients: [rice, chicken], servings: 2 });
    expect(n.basisGrams).toBe(500);
    expect(n.perServingGrams).toBe(250);
    expect(n.cookedWeightKnown).toBe(false);
    expect(n.per100g?.energyKcal).toBe(151);
  });

  it('a single serving is the whole recipe', () => {
    const n = computeRecipe({ ingredients: [rice], servings: 1, cookedWeightGrams: 500 });
    expect(n.perServing).toEqual(n.totals);
    expect(n.perServingGrams).toBe(500);
  });

  it('an ingredient with unknown nutrients stays unknown: not zero, and the result is partial', () => {
    const spice = ingredient('mystery sauce', 100);
    const n = computeRecipe({ ingredients: [rice, spice], servings: 1 });
    expect(n.ingredientsCounted).toBe(1);
    expect(n.ingredientsTotal).toBe(2);
    expect(n.partial).toBe(true);
    // Only what is known is summed; nothing is invented for the sauce.
    expect(n.totals.energyKcal).toBe(260);
  });

  it('a nutrient that only some ingredients know is a partial total too', () => {
    const n = computeRecipe({ ingredients: [rice, chicken], servings: 1 });
    // chicken has no carbohydrate in this fixture.
    expect(n.totals.carbohydrate).toBe(56);
    expect(n.partial).toBe(true);
  });

  it('is complete when every ingredient knows every listed nutrient', () => {
    const a = ingredient('a', 100, { energyKcal: 100, protein: 10 });
    const b = ingredient('b', 100, { energyKcal: 50, protein: 5 });
    const n = computeRecipe({ ingredients: [a, b], servings: 2, cookedWeightGrams: 150 });
    expect(n.partial).toBe(false);
    expect(n.totals).toEqual({ energyKcal: 150, protein: 15 });
  });

  it('with no ingredient knowing any nutrient there are no figures at all', () => {
    const n = computeRecipe({ ingredients: [ingredient('x', 50)], servings: 1 });
    expect(n.totals).toEqual({});
    expect(n.per100g).toBeUndefined();
    expect(n.partial).toBe(true);
  });
});

describe('recipeProblem', () => {
  it('accepts a normal recipe', () => {
    expect(recipeProblem({ ingredients: [rice], servings: 2, cookedWeightGrams: 300 })).toBeNull();
  });

  it('names the first thing wrong', () => {
    expect(recipeProblem({ ingredients: [], servings: 1 })).toBe('noIngredients');
    expect(recipeProblem({ ingredients: [ingredient('x', undefined)], servings: 1 })).toBe(
      'ingredientWithoutGrams',
    );
    expect(recipeProblem({ ingredients: [rice], servings: 0 })).toBe('badServings');
    expect(recipeProblem({ ingredients: [rice], servings: 1.5 })).toBe('badServings');
    expect(recipeProblem({ ingredients: [rice], servings: 101 })).toBe('badServings');
    expect(recipeProblem({ ingredients: [rice], servings: 1, cookedWeightGrams: 0 })).toBe(
      'badCookedWeight',
    );
    expect(recipeProblem({ ingredients: [rice], servings: 1, cookedWeightGrams: 30_000 })).toBe(
      'badCookedWeight',
    );
    expect(
      recipeProblem({
        ingredients: [ingredient('big', 5000)],
        servings: 1,
        cookedWeightGrams: 9000,
      }),
    ).toBe('servingTooHeavy');
    const many = Array.from({ length: 41 }, () => rice);
    expect(recipeProblem({ ingredients: many, servings: 50 })).toBe('tooManyIngredients');
  });
});

describe('recipeAsFood', () => {
  const recipe: Recipe = {
    id: 12,
    name: 'Chicken and rice',
    createdAtUtc: 0,
    servings: 4,
    cookedWeightGrams: 800,
    ingredients: [rice, chicken],
  };

  it('is a recipe-source food with the group of its heaviest ingredient and per-100 g nutrients', () => {
    const food = recipeAsFood(recipe);
    expect(food.source).toBe('recipe');
    expect(food.sourceRef).toBe(recipeSourceRef(12));
    expect(food.sourceRef).toBe('recipe:12');
    expect(food.foodGroup).toBe('protein');
    expect(food.nutrientsPer100g?.energyKcal).toBe(94.38);
  });

  it('is flagged as an estimate when partial or without a cooked weight, and not otherwise', () => {
    expect(recipeAsFood(recipe).extra?.nutrientsEstimated).toBe(true); // carbohydrate partial
    const clean: Recipe = {
      ...recipe,
      ingredients: [
        ingredient('a', 100, { energyKcal: 100 }),
        ingredient('b', 100, { energyKcal: 50 }),
      ],
    };
    expect(recipeAsFood(clean).extra).toBeUndefined();
    const noWeight: Recipe = { ...clean };
    delete (noWeight as { cookedWeightGrams?: number }).cookedWeightGrams;
    expect(recipeAsFood(noWeight).extra?.nutrientsEstimated).toBe(true);
  });

  it('has no nutrients when no ingredient knows any', () => {
    const food = recipeAsFood({ ...recipe, ingredients: [ingredient('x', 100)] });
    expect(food.nutrientsPer100g).toBeUndefined();
  });
});

describe('recipeFoodGroup', () => {
  it('is other only when nothing else carries weight', () => {
    expect(recipeFoodGroup([ingredient('x', 100)])).toBe('other');
    expect(recipeFoodGroup([ingredient('x', 900), ingredient('y', 10, undefined, 'dairy')])).toBe(
      'dairy',
    );
  });
});

describe('cleanSavedName', () => {
  it('trims, collapses whitespace, caps the length and refuses an empty name', () => {
    expect(cleanSavedName('  My   usual \n breakfast ')).toBe('My usual breakfast');
    expect(cleanSavedName('   ')).toBeNull();
    expect(Array.from(cleanSavedName('x'.repeat(200)) ?? '')).toHaveLength(80);
  });
});

describe('implausible cooked weight', () => {
  const raw = [ingredient('a', 300), ingredient('b', 200)]; // 500 g raw

  it('is refused outside a fifth to three times the raw weight, and accepted inside it', () => {
    for (const cooked of [90, 1600]) {
      expect(recipeProblem({ ingredients: raw, servings: 2, cookedWeightGrams: cooked })).toBe(
        'cookedWeightImplausible',
      );
    }
    for (const cooked of [100, 400, 1500]) {
      expect(
        recipeProblem({ ingredients: raw, servings: 2, cookedWeightGrams: cooked }),
      ).toBeNull();
    }
  });

  it('a dropped (implausible) value marks the result partial instead of vanishing silently', () => {
    // 500 g of pure oil cooked down to 100 g: 900 kcal/100 g x 5 = 4500 kcal per 100 g, over the cap.
    const oil = ingredient('oil', 500, { energyKcal: 900, fat: 100 });
    const n = computeRecipe({ ingredients: [oil], servings: 1, cookedWeightGrams: 100 });
    expect(n.per100g).toBeUndefined();
    expect(n.partial).toBe(true);
    expect(n.totals.energyKcal).toBe(4500);
    // A normal recipe is not flagged by the same check.
    expect(computeRecipe({ ingredients: [oil], servings: 1 }).partial).toBe(false);
  });
});

describe('estimates in the ingredients', () => {
  const full = { energyKcal: 100, protein: 10 };
  const guessed = (name: string): FoodEntryDraft => {
    const base = ingredient(name, 100, full);
    return { ...base, quantity: { ...base.quantity, gramsEstimated: true } };
  };
  const aiFood = (): FoodEntryDraft => {
    const base = ingredient('ai', 100, full);
    return {
      ...base,
      databaseFood: databaseFood({
        ...base.databaseFood,
        nutrientsPer100g: full,
        extra: { nutrientsEstimated: true },
      }),
    };
  };
  const recipeOf = (ingredients: readonly FoodEntryDraft[]): Recipe => ({
    id: 1,
    name: 'r',
    createdAtUtc: 0,
    servings: 2,
    cookedWeightGrams: 200,
    ingredients,
  });

  it('exact ingredients, a cooked weight and complete data read as exact', () => {
    const r = recipeOf([ingredient('a', 100, full), ingredient('b', 100, full)]);
    expect(computeRecipe(r).anyEstimated).toBe(false);
    expect(recipeAsFood(r).extra).toBeUndefined();
  });

  it('a guessed weight or an estimated food makes the whole recipe an estimate', () => {
    for (const r of [
      recipeOf([guessed('a'), ingredient('b', 100, full)]),
      recipeOf([aiFood(), ingredient('b', 100, full)]),
    ]) {
      expect(computeRecipe(r).anyEstimated).toBe(true);
      expect(recipeAsFood(r).extra?.nutrientsEstimated).toBe(true);
    }
  });

  it('an estimated sub-recipe (a recipe food used as an ingredient) carries its flag', () => {
    const inner = recipeAsFood({ ...recipeOf([guessed('a')]), id: 2, name: 'inner' });
    const asIngredient: FoodEntryDraft = {
      databaseFood: inner,
      quantity: { low: 100, high: 100, unit: 'g', displayLabel: '100 g', grams: 100 },
    };
    expect(recipeAsFood(recipeOf([asIngredient, ingredient('b', 100, full)])).extra).toMatchObject({
      nutrientsEstimated: true,
    });
  });
});

describe('recipe food groups', () => {
  it('keeps every group above a 15 % share of the weight, heaviest first, never other', () => {
    const groups = recipeFoodGroups([
      ingredient('beans', 400, undefined, 'protein'),
      ingredient('carrot', 300, undefined, 'vegFruit'),
      ingredient('rice', 200, undefined, 'starch'),
      ingredient('cheese', 50, undefined, 'dairy'),
      ingredient('salt', 50, undefined, 'other'),
    ]);
    expect(groups).toEqual(['protein', 'vegFruit', 'starch']);
  });

  it('a recipe food carries them in extra.groups (when more than one), and they survive sanitising', () => {
    const recipe: Recipe = {
      id: 3,
      name: 'Stew',
      createdAtUtc: 0,
      servings: 2,
      ingredients: [
        ingredient('beans', 300, { energyKcal: 100 }, 'protein'),
        ingredient('carrot', 300, { energyKcal: 40 }, 'vegFruit'),
      ],
    };
    const food = recipeAsFood(recipe);
    expect(food.extra?.groups).toEqual(['protein', 'vegFruit']);
    expect(sanitizeFoodExtra(JSON.parse(JSON.stringify(food.extra)))?.groups).toEqual([
      'protein',
      'vegFruit',
    ]);
    expect(sanitizeFoodExtra({ groups: ['other', 'bogus', 'dairy', 'dairy'] })?.groups).toEqual([
      'dairy',
    ]);
    expect(sanitizeFoodExtra({ groups: ['other'] })).toBeUndefined();
  });
});
