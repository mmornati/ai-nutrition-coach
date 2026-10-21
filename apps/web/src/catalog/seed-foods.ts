/**
 * Seeded food list for `OfflineFirstFoodCatalog` (port of the earlier client).
 *
 * Ships with the app: no network call, no OFF / USDA fetch. 30+ curated, offline-safe entries
 * across the four balance-arc groups plus a handful of `other` entries. Each entry carries a
 * stable `id` (its name in every language lives in the catalogue, `foods.names.<id>`), a
 * `FoodGroup` tag, one or more honest portion presets `(low, high, unit, grams)`, and the code of
 * the CIQUAL food its per-100 g nutrients come from, and those nutrients themselves, copied here
 * (docs/adr/0006). The `~1–2 cups` label is built
 * from the range in the person's language (see `food-display.ts`).
 *
 * GRAMS are the edible weight of the whole preset (the middle of a range), from standard household
 * measures: a cup of cooked grains / pulses 150-200 g, a cup of raw leaves 30 g, a cup of milk or
 * yogurt 245 g, a tablespoon of oil 14 g, a medium fruit or vegetable without peel or core
 * (apple 150, banana 120, orange 130, tomato 120, carrot 60), an egg 55 g, a slice of bread 35 g, a
 * fist of cooked meat or fish 120 g, a handful of nuts 28 g. They are estimates (`gramsEstimated`).
 *
 * CIQUAL CODES pick the most generic item of the table (an "average food" row when there is one,
 * cooked for grains, pulses, potatoes and meat). Approximations: Cottage Cheese uses plain fromage
 * blanc 2-3 % (CIQUAL has no cottage cheese); Mixed Nuts uses the unsalted nut-and-peanut average;
 * Oats are dry flakes; Tortilla is the wheat one.
 *
 * `sourceRef` is what a logged plate keeps, so it is FROZEN: `seed:<English name, lower-cased>`,
 * exactly as before the ids existed. A stored plate's ref therefore resolves to the same seed
 * (and so to its name in any language) with no migration, and it never collides with OFF barcodes.
 */
import type { FoodGroup, Nutrients } from '@anc/core';

/** A portion before it has a label: the label is worded in the current language on demand. */
export interface SeedPreset {
  readonly low: number;
  readonly high: number;
  /** A key of the catalogue's `foods.units`. */
  readonly unit: string;
  /** Edible weight of the whole preset, in grams (an estimate). */
  readonly grams?: number;
}

export interface SeedFood {
  /** Stable key of the name in the catalogue (`foods.names.<id>`). Never reworded. */
  readonly id: string;
  /** Frozen, language-independent: `seed:` + the English name, lower-cased. */
  readonly sourceRef: string;
  readonly foodGroup: FoodGroup;
  /** Code of the CIQUAL food that gives the per-100 g nutrients (`ciqual-2025.json`). */
  readonly ciqual?: string;
  /**
   * Per-100 g nutrients, copied from that CIQUAL row so a seed never waits for the 500 kB table. A
   * test pins them to `ciqual-2025.json`; re-copy them when the table is updated.
   */
  readonly nutrients: Nutrients;
  readonly presets: readonly SeedPreset[];
}

const p = (low: number, high: number, unit: string, grams: number): SeedPreset => ({
  low,
  high,
  unit,
  grams,
});

const seed = (
  id: string,
  englishName: string,
  foodGroup: FoodGroup,
  ciqual: string,
  nutrients: Nutrients,
  presets: readonly SeedPreset[],
): SeedFood => ({
  id,
  sourceRef: `seed:${englishName.toLowerCase()}`,
  foodGroup,
  ciqual,
  nutrients,
  presets,
});

export const seedFoods: readonly SeedFood[] = [
  seed(
    'apple',
    'Apple',
    'vegFruit',
    '13396',
    {
      energyKcal: 51.3,
      protein: 0.26,
      carbohydrate: 11.9,
      sugars: 11.4,
      fat: 0.24,
      saturatedFat: 0,
      fibre: 2.39,
      salt: 0.01,
    },
    [p(1, 1, 'piece', 150), p(2, 2, 'piece', 300)],
  ),
  seed(
    'banana',
    'Banana',
    'vegFruit',
    '13005',
    {
      energyKcal: 87.6,
      protein: 1.06,
      carbohydrate: 19.7,
      sugars: 15.6,
      saturatedFat: 0,
      fibre: 2.7,
      salt: 0,
    },
    [p(1, 1, 'piece', 120)],
  ),
  seed(
    'orange',
    'Orange',
    'vegFruit',
    '13034',
    {
      energyKcal: 42,
      protein: 0.75,
      carbohydrate: 8.03,
      sugars: 7.6,
      saturatedFat: 0,
      fibre: 2.7,
      salt: 0,
    },
    [p(1, 1, 'piece', 130)],
  ),
  seed(
    'spinach',
    'Spinach',
    'vegFruit',
    '20059',
    {
      energyKcal: 33.3,
      protein: 2.68,
      carbohydrate: 3.06,
      sugars: 0.46,
      fat: 0.39,
      saturatedFat: 0.06,
      fibre: 2.6,
      salt: 0.2,
    },
    [p(1, 2, 'cup', 45)],
  ),
  seed(
    'broccoli',
    'Broccoli',
    'vegFruit',
    '20350',
    {
      energyKcal: 21.8,
      protein: 2.19,
      carbohydrate: 1.03,
      sugars: 0.6,
      fat: 0.5,
      saturatedFat: 0.14,
      fibre: 3,
      salt: 0.03,
    },
    [p(1, 1, 'cup', 90)],
  ),
  seed(
    'carrot',
    'Carrot',
    'vegFruit',
    '20009',
    { energyKcal: 30.2, protein: 0.78, carbohydrate: 5.16, sugars: 4.85, fibre: 2.9, salt: 0.12 },
    [p(1, 1, 'piece', 60), p(2, 2, 'piece', 120)],
  ),
  seed(
    'tomato',
    'Tomato',
    'vegFruit',
    '20385',
    {
      energyKcal: 19.2,
      protein: 0.6,
      carbohydrate: 3.69,
      sugars: 3.22,
      saturatedFat: 0,
      fibre: 1.02,
      salt: 0,
    },
    [p(1, 1, 'piece', 120)],
  ),
  seed(
    'avocado',
    'Avocado',
    'vegFruit',
    '13004',
    {
      energyKcal: 203,
      protein: 1.56,
      carbohydrate: 0,
      sugars: 0.4,
      fat: 20.6,
      saturatedFat: 4.51,
      fibre: 3.6,
      salt: 0.02,
    },
    [p(0.5, 1, 'piece', 110)],
  ),
  seed(
    'strawberries',
    'Strawberries',
    'vegFruit',
    '13014',
    {
      energyKcal: 35.1,
      protein: 0.63,
      carbohydrate: 6.03,
      sugars: 5.6,
      saturatedFat: 0,
      fibre: 3.8,
      salt: 0,
    },
    [p(0.5, 1, 'cup', 110)],
  ),
  seed(
    'salmon',
    'Salmon',
    'protein',
    '25996',
    {
      energyKcal: 205,
      protein: 23.2,
      carbohydrate: 0.61,
      sugars: 0,
      fat: 12.2,
      saturatedFat: 2.48,
      fibre: 0,
      salt: 0.13,
    },
    [p(1, 1, 'fist', 120), p(1.5, 1.5, 'fist', 180)],
  ),
  seed(
    'chickenBreast',
    'Chicken Breast',
    'protein',
    '36018',
    {
      energyKcal: 141,
      protein: 30.1,
      carbohydrate: 0,
      sugars: 0,
      fat: 2,
      saturatedFat: 0.58,
      fibre: 0,
      salt: 0.14,
    },
    [p(1, 1, 'fist', 120)],
  ),
  seed(
    'eggs',
    'Eggs',
    'protein',
    '22010',
    {
      energyKcal: 134,
      protein: 13.5,
      carbohydrate: 0.52,
      sugars: 0.52,
      fat: 8.62,
      saturatedFat: 3.22,
      fibre: 0,
      salt: 0.31,
    },
    [p(1, 2, 'piece', 80), p(3, 3, 'piece', 165)],
  ),
  seed(
    'tofu',
    'Tofu',
    'protein',
    '20904',
    {
      energyKcal: 147,
      protein: 13.4,
      carbohydrate: 2.87,
      sugars: 0.57,
      fat: 8.5,
      saturatedFat: 1.35,
      salt: 0.03,
    },
    [p(0.5, 1, 'cup', 190)],
  ),
  seed(
    'beef',
    'Beef',
    'protein',
    '6259',
    {
      energyKcal: 229,
      protein: 23.8,
      carbohydrate: 0,
      sugars: 0,
      fat: 14.9,
      saturatedFat: 5.57,
      fibre: 0,
      salt: 0.2,
    },
    [p(1, 1, 'fist', 120)],
  ),
  seed(
    'tuna',
    'Tuna',
    'protein',
    '26039',
    {
      energyKcal: 143,
      protein: 26.8,
      carbohydrate: 0,
      sugars: 0,
      fat: 3.94,
      saturatedFat: 1.01,
      fibre: 0,
      salt: 0.74,
    },
    [p(1, 1, 'can', 110)],
  ),
  seed(
    'lentils',
    'Lentils',
    'protein',
    '20360',
    {
      energyKcal: 125,
      protein: 10.1,
      carbohydrate: 16.2,
      sugars: 0.2,
      fat: 0.57,
      saturatedFat: 0.09,
      fibre: 8.45,
      salt: 0.02,
    },
    [p(0.5, 1, 'cup', 150)],
  ),
  seed(
    'chickpeas',
    'Chickpeas',
    'protein',
    '20507',
    {
      energyKcal: 148,
      protein: 8.31,
      carbohydrate: 17.7,
      sugars: 0.3,
      fat: 3,
      saturatedFat: 0.46,
      fibre: 8.2,
      salt: 0.03,
    },
    [p(0.5, 1, 'cup', 125)],
  ),
  seed(
    'rice',
    'Rice',
    'starch',
    '9104',
    {
      energyKcal: 155,
      protein: 3.15,
      carbohydrate: 33.2,
      sugars: 0,
      fat: 0.7,
      saturatedFat: 0.17,
      fibre: 1.4,
      salt: 0.05,
    },
    [p(1, 1, 'cup', 150), p(2, 2, 'cup', 300)],
  ),
  seed(
    'pasta',
    'Pasta',
    'starch',
    '9811',
    {
      energyKcal: 167,
      protein: 6.1,
      carbohydrate: 31.4,
      sugars: 0.87,
      fat: 1.1,
      saturatedFat: 0.2,
      fibre: 2.2,
      salt: 0.05,
    },
    [p(1, 1, 'cup', 140)],
  ),
  seed(
    'bread',
    'Bread',
    'starch',
    '7001',
    {
      energyKcal: 287,
      protein: 8.27,
      carbohydrate: 58.3,
      sugars: 2.3,
      fat: 1.4,
      saturatedFat: 0.45,
      fibre: 2.7,
      salt: 1.25,
    },
    [p(1, 2, 'slice', 53)],
  ),
  seed(
    'potato',
    'Potato',
    'starch',
    '4003',
    {
      energyKcal: 81,
      protein: 1.8,
      carbohydrate: 16.8,
      sugars: 0.86,
      fat: 0.34,
      saturatedFat: 0.09,
      fibre: 1.8,
      salt: 0.05,
    },
    [p(1, 1, 'piece', 170)],
  ),
  seed(
    'quinoa',
    'Quinoa',
    'starch',
    '9341',
    {
      energyKcal: 149,
      protein: 4.66,
      carbohydrate: 27.9,
      sugars: 0.87,
      fat: 1.1,
      saturatedFat: 0.14,
      fibre: 3.8,
      salt: 0.02,
    },
    [p(0.5, 1, 'cup', 140)],
  ),
  seed(
    'oats',
    'Oats',
    'starch',
    '32140',
    {
      energyKcal: 369,
      protein: 10.6,
      carbohydrate: 57.7,
      sugars: 1.04,
      fat: 7.82,
      saturatedFat: 1.37,
      fibre: 11.2,
      salt: 0.01,
    },
    [p(0.5, 1, 'cup', 60)],
  ),
  seed(
    'sweetPotato',
    'Sweet Potato',
    'starch',
    '4102',
    {
      energyKcal: 79.1,
      protein: 1.69,
      carbohydrate: 16.3,
      sugars: 6.11,
      fat: 0.15,
      saturatedFat: 0.04,
      fibre: 2.9,
      salt: 0.08,
    },
    [p(1, 1, 'piece', 130)],
  ),
  seed(
    'tortilla',
    'Tortilla',
    'starch',
    '7815',
    {
      energyKcal: 320,
      protein: 8.01,
      carbohydrate: 53,
      sugars: 2.12,
      fat: 7.48,
      saturatedFat: 1.39,
      fibre: 2.89,
      salt: 1.41,
    },
    [p(1, 2, 'piece', 68)],
  ),
  seed(
    'yogurt',
    'Yogurt',
    'dairy',
    '19593',
    {
      energyKcal: 50.1,
      protein: 3.83,
      carbohydrate: 4.26,
      sugars: 4,
      fat: 1.68,
      saturatedFat: 1.08,
      fibre: 0,
      salt: 0.1,
    },
    [p(0.5, 1, 'cup', 125), p(1, 1, 'cup', 245)],
  ),
  seed(
    'milk',
    'Milk',
    'dairy',
    '19033',
    {
      energyKcal: 47.5,
      protein: 3.46,
      carbohydrate: 4.97,
      sugars: 4.91,
      fat: 1.55,
      saturatedFat: 0.98,
      fibre: 0,
      salt: 0.09,
    },
    [p(1, 1, 'cup', 245)],
  ),
  seed(
    'cheese',
    'Cheese',
    'dairy',
    '12115',
    {
      energyKcal: 373,
      protein: 27.9,
      carbohydrate: 0,
      sugars: 0,
      fat: 28.8,
      saturatedFat: 19.7,
      fibre: 0,
      salt: 0.61,
    },
    [p(1, 2, 'slice', 30)],
  ),
  seed(
    'cottageCheese',
    'Cottage Cheese',
    'dairy',
    '19646',
    {
      energyKcal: 75.7,
      protein: 7.28,
      carbohydrate: 3.86,
      sugars: 3.86,
      fat: 3.23,
      saturatedFat: 2.07,
      fibre: 0.02,
      salt: 0.09,
    },
    [p(0.5, 1, 'cup', 170)],
  ),
  seed(
    'butter',
    'Butter',
    'dairy',
    '16414',
    {
      energyKcal: 731,
      protein: 0.63,
      carbohydrate: 0.88,
      sugars: 0.73,
      fat: 80.5,
      saturatedFat: 58,
      fibre: 0,
      salt: 0.06,
    },
    [p(1, 1, 'tbsp', 14)],
  ),
  seed(
    'greekYogurt',
    'Greek Yogurt',
    'dairy',
    '19860',
    {
      energyKcal: 103,
      protein: 3.02,
      carbohydrate: 3.73,
      sugars: 3.11,
      fat: 8.16,
      saturatedFat: 5.26,
      fibre: 0.07,
      salt: 0.08,
    },
    [p(0.5, 1, 'cup', 185)],
  ),
  seed(
    'kefir',
    'Kefir',
    'dairy',
    '19865',
    {
      energyKcal: 61.1,
      protein: 3.19,
      carbohydrate: 4.5,
      sugars: 3.42,
      fat: 3.4,
      saturatedFat: 2.33,
      fibre: 0,
      salt: 0.12,
    },
    [p(1, 1, 'cup', 245)],
  ),
  seed(
    'mixedNuts',
    'Mixed Nuts',
    'other',
    '15066',
    {
      energyKcal: 632,
      protein: 15.5,
      carbohydrate: 10.5,
      sugars: 5.55,
      fat: 55,
      saturatedFat: 5.89,
      fibre: 10.7,
      salt: 0.01,
    },
    [p(1, 2, 'handful', 42)],
  ),
  seed(
    'oliveOil',
    'Olive Oil',
    'other',
    '17270',
    {
      energyKcal: 899,
      protein: 0.25,
      carbohydrate: 0,
      sugars: 0,
      fat: 99.9,
      saturatedFat: 15.2,
      fibre: 0,
      salt: 0,
    },
    [p(1, 1, 'tbsp', 14)],
  ),
  seed(
    'darkChocolate',
    'Dark Chocolate',
    'other',
    '31074',
    {
      energyKcal: 591,
      protein: 10.4,
      carbohydrate: 26.9,
      sugars: 17.9,
      fat: 46.3,
      saturatedFat: 28.7,
      fibre: 12.8,
      salt: 0.02,
    },
    [p(1, 2, 'square', 15)],
  ),
];

const byRef: ReadonlyMap<string, SeedFood> = new Map(seedFoods.map((s) => [s.sourceRef, s]));

/** The seed a stored `sourceRef` names (case-insensitive, as the catalog always matched it). */
export const seedForRef = (sourceRef: string): SeedFood | undefined =>
  byRef.get(sourceRef.toLowerCase());
