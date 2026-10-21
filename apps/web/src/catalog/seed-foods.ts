/**
 * Seeded food list for `OfflineFirstFoodCatalog` (port of the earlier client).
 *
 * Ships with the app: no network call, no OFF / USDA fetch. 30+ curated, offline-safe entries
 * across the four balance-arc groups plus a handful of `other` entries. Each entry carries a
 * stable `id` (its name in every language lives in the catalogue, `foods.names.<id>`), a
 * `FoodGroup` tag, one or more honest portion presets `(low, high, unit, grams)`, and the code of
 * the CIQUAL food its per-100 g nutrients come from (docs/adr/0006). The `~1–2 cups` label is built
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
import type { FoodGroup } from '@anc/core';

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
  presets: readonly SeedPreset[],
): SeedFood => ({
  id,
  sourceRef: `seed:${englishName.toLowerCase()}`,
  foodGroup,
  ciqual,
  presets,
});

export const seedFoods: readonly SeedFood[] = [
  seed('apple', 'Apple', 'vegFruit', '13396', [p(1, 1, 'piece', 150), p(2, 2, 'piece', 300)]),
  seed('banana', 'Banana', 'vegFruit', '13005', [p(1, 1, 'piece', 120)]),
  seed('orange', 'Orange', 'vegFruit', '13034', [p(1, 1, 'piece', 130)]),
  seed('spinach', 'Spinach', 'vegFruit', '20059', [p(1, 2, 'cup', 45)]),
  seed('broccoli', 'Broccoli', 'vegFruit', '20350', [p(1, 1, 'cup', 90)]),
  seed('carrot', 'Carrot', 'vegFruit', '20009', [p(1, 1, 'piece', 60), p(2, 2, 'piece', 120)]),
  seed('tomato', 'Tomato', 'vegFruit', '20385', [p(1, 1, 'piece', 120)]),
  seed('avocado', 'Avocado', 'vegFruit', '13004', [p(0.5, 1, 'piece', 110)]),
  seed('strawberries', 'Strawberries', 'vegFruit', '13014', [p(0.5, 1, 'cup', 110)]),
  seed('salmon', 'Salmon', 'protein', '25996', [p(1, 1, 'fist', 120), p(1.5, 1.5, 'fist', 180)]),
  seed('chickenBreast', 'Chicken Breast', 'protein', '36018', [p(1, 1, 'fist', 120)]),
  seed('eggs', 'Eggs', 'protein', '22010', [p(1, 2, 'piece', 80), p(3, 3, 'piece', 165)]),
  seed('tofu', 'Tofu', 'protein', '20904', [p(0.5, 1, 'cup', 190)]),
  seed('beef', 'Beef', 'protein', '6259', [p(1, 1, 'fist', 120)]),
  seed('tuna', 'Tuna', 'protein', '26039', [p(1, 1, 'can', 110)]),
  seed('lentils', 'Lentils', 'protein', '20360', [p(0.5, 1, 'cup', 150)]),
  seed('chickpeas', 'Chickpeas', 'protein', '20507', [p(0.5, 1, 'cup', 125)]),
  seed('rice', 'Rice', 'starch', '9104', [p(1, 1, 'cup', 150), p(2, 2, 'cup', 300)]),
  seed('pasta', 'Pasta', 'starch', '9811', [p(1, 1, 'cup', 140)]),
  seed('bread', 'Bread', 'starch', '7001', [p(1, 2, 'slice', 53)]),
  seed('potato', 'Potato', 'starch', '4003', [p(1, 1, 'piece', 170)]),
  seed('quinoa', 'Quinoa', 'starch', '9341', [p(0.5, 1, 'cup', 140)]),
  seed('oats', 'Oats', 'starch', '32140', [p(0.5, 1, 'cup', 60)]),
  seed('sweetPotato', 'Sweet Potato', 'starch', '4102', [p(1, 1, 'piece', 130)]),
  seed('tortilla', 'Tortilla', 'starch', '7815', [p(1, 2, 'piece', 68)]),
  seed('yogurt', 'Yogurt', 'dairy', '19593', [p(0.5, 1, 'cup', 125), p(1, 1, 'cup', 245)]),
  seed('milk', 'Milk', 'dairy', '19033', [p(1, 1, 'cup', 245)]),
  seed('cheese', 'Cheese', 'dairy', '12115', [p(1, 2, 'slice', 30)]),
  seed('cottageCheese', 'Cottage Cheese', 'dairy', '19646', [p(0.5, 1, 'cup', 170)]),
  seed('butter', 'Butter', 'dairy', '16414', [p(1, 1, 'tbsp', 14)]),
  seed('greekYogurt', 'Greek Yogurt', 'dairy', '19860', [p(0.5, 1, 'cup', 185)]),
  seed('kefir', 'Kefir', 'dairy', '19865', [p(1, 1, 'cup', 245)]),
  seed('mixedNuts', 'Mixed Nuts', 'other', '15066', [p(1, 2, 'handful', 42)]),
  seed('oliveOil', 'Olive Oil', 'other', '17270', [p(1, 1, 'tbsp', 14)]),
  seed('darkChocolate', 'Dark Chocolate', 'other', '31074', [p(1, 2, 'square', 15)]),
];

const byRef: ReadonlyMap<string, SeedFood> = new Map(seedFoods.map((s) => [s.sourceRef, s]));

/** The seed a stored `sourceRef` names (case-insensitive, as the catalog always matched it). */
export const seedForRef = (sourceRef: string): SeedFood | undefined =>
  byRef.get(sourceRef.toLowerCase());
