/**
 * Seeded food list for `OfflineFirstFoodCatalog` (port of the earlier client).
 *
 * Ships with the app: no network call, no OFF / USDA fetch. 30+ curated, offline-safe entries
 * across the four balance-arc groups plus a handful of `other` entries. Each entry carries a
 * stable `id` (its name in every language lives in the catalogue, `foods.names.<id>`), a
 * `FoodGroup` tag, and one or more honest portion presets `(low, high, unit)`; the `~1–2 cups`
 * label is built from them in the person's language (see `food-display.ts`), never a kcal figure.
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
}

export interface SeedFood {
  /** Stable key of the name in the catalogue (`foods.names.<id>`). Never reworded. */
  readonly id: string;
  /** Frozen, language-independent: `seed:` + the English name, lower-cased. */
  readonly sourceRef: string;
  readonly foodGroup: FoodGroup;
  readonly presets: readonly SeedPreset[];
}

const p = (low: number, high: number, unit: string): SeedPreset => ({ low, high, unit });

const seed = (
  id: string,
  englishName: string,
  foodGroup: FoodGroup,
  presets: readonly SeedPreset[],
): SeedFood => ({ id, sourceRef: `seed:${englishName.toLowerCase()}`, foodGroup, presets });

export const seedFoods: readonly SeedFood[] = [
  seed('apple', 'Apple', 'vegFruit', [p(1, 1, 'piece'), p(2, 2, 'piece')]),
  seed('banana', 'Banana', 'vegFruit', [p(1, 1, 'piece')]),
  seed('orange', 'Orange', 'vegFruit', [p(1, 1, 'piece')]),
  seed('spinach', 'Spinach', 'vegFruit', [p(1, 2, 'cup')]),
  seed('broccoli', 'Broccoli', 'vegFruit', [p(1, 1, 'cup')]),
  seed('carrot', 'Carrot', 'vegFruit', [p(1, 1, 'piece'), p(2, 2, 'piece')]),
  seed('tomato', 'Tomato', 'vegFruit', [p(1, 1, 'piece')]),
  seed('avocado', 'Avocado', 'vegFruit', [p(0.5, 1, 'piece')]),
  seed('strawberries', 'Strawberries', 'vegFruit', [p(0.5, 1, 'cup')]),
  seed('salmon', 'Salmon', 'protein', [p(1, 1, 'fist'), p(1.5, 1.5, 'fist')]),
  seed('chickenBreast', 'Chicken Breast', 'protein', [p(1, 1, 'fist')]),
  seed('eggs', 'Eggs', 'protein', [p(1, 2, 'piece'), p(3, 3, 'piece')]),
  seed('tofu', 'Tofu', 'protein', [p(0.5, 1, 'cup')]),
  seed('beef', 'Beef', 'protein', [p(1, 1, 'fist')]),
  seed('tuna', 'Tuna', 'protein', [p(1, 1, 'can')]),
  seed('lentils', 'Lentils', 'protein', [p(0.5, 1, 'cup')]),
  seed('chickpeas', 'Chickpeas', 'protein', [p(0.5, 1, 'cup')]),
  seed('rice', 'Rice', 'starch', [p(1, 1, 'cup'), p(2, 2, 'cup')]),
  seed('pasta', 'Pasta', 'starch', [p(1, 1, 'cup')]),
  seed('bread', 'Bread', 'starch', [p(1, 2, 'slice')]),
  seed('potato', 'Potato', 'starch', [p(1, 1, 'piece')]),
  seed('quinoa', 'Quinoa', 'starch', [p(0.5, 1, 'cup')]),
  seed('oats', 'Oats', 'starch', [p(0.5, 1, 'cup')]),
  seed('sweetPotato', 'Sweet Potato', 'starch', [p(1, 1, 'piece')]),
  seed('tortilla', 'Tortilla', 'starch', [p(1, 2, 'piece')]),
  seed('yogurt', 'Yogurt', 'dairy', [p(0.5, 1, 'cup'), p(1, 1, 'cup')]),
  seed('milk', 'Milk', 'dairy', [p(1, 1, 'cup')]),
  seed('cheese', 'Cheese', 'dairy', [p(1, 2, 'slice')]),
  seed('cottageCheese', 'Cottage Cheese', 'dairy', [p(0.5, 1, 'cup')]),
  seed('butter', 'Butter', 'dairy', [p(1, 1, 'tbsp')]),
  seed('greekYogurt', 'Greek Yogurt', 'dairy', [p(0.5, 1, 'cup')]),
  seed('kefir', 'Kefir', 'dairy', [p(1, 1, 'cup')]),
  seed('mixedNuts', 'Mixed Nuts', 'other', [p(1, 2, 'handful')]),
  seed('oliveOil', 'Olive Oil', 'other', [p(1, 1, 'tbsp')]),
  seed('darkChocolate', 'Dark Chocolate', 'other', [p(1, 2, 'square')]),
];

const byRef: ReadonlyMap<string, SeedFood> = new Map(seedFoods.map((s) => [s.sourceRef, s]));

/** The seed a stored `sourceRef` names (case-insensitive, as the catalog always matched it). */
export const seedForRef = (sourceRef: string): SeedFood | undefined =>
  byRef.get(sourceRef.toLowerCase());
