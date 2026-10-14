/**
 * Seeded food list for `OfflineFirstFoodCatalog` (port of `seed_foods.dart`).
 *
 * Ships with the app: no network call, no OFF / USDA fetch. 30+ curated, offline-safe entries
 * across the four balance-arc groups plus a handful of `other` entries. Each entry carries a
 * canonical `displayName` (surfaced verbatim), a `FoodGroup` tag, and one or more honest
 * `QuantityRange` presets with a `~` label (never a kcal figure).
 *
 * `sourceRef` is built by the catalog as `seed:<displayName>` (lower-cased) so it round-trips
 * through `DatabaseFood` and never collides with OFF barcodes.
 */
import type { FoodGroup, QuantityRange } from '@anc/core';

export interface SeedFood {
  readonly displayName: string;
  readonly foodGroup: FoodGroup;
  readonly presets: readonly QuantityRange[];
}

const q = (low: number, high: number, unit: string, displayLabel: string): QuantityRange => ({
  low,
  high,
  unit,
  displayLabel,
});

export const seedFoods: readonly SeedFood[] = [
  {
    displayName: 'Apple',
    foodGroup: 'vegFruit',
    presets: [q(1, 1, 'piece', '~1 piece'), q(2, 2, 'piece', '~2 pieces')],
  },
  { displayName: 'Banana', foodGroup: 'vegFruit', presets: [q(1, 1, 'piece', '~1 piece')] },
  { displayName: 'Orange', foodGroup: 'vegFruit', presets: [q(1, 1, 'piece', '~1 piece')] },
  { displayName: 'Spinach', foodGroup: 'vegFruit', presets: [q(1, 2, 'cup', '~1–2 cups')] },
  { displayName: 'Broccoli', foodGroup: 'vegFruit', presets: [q(1, 1, 'cup', '~1 cup')] },
  {
    displayName: 'Carrot',
    foodGroup: 'vegFruit',
    presets: [q(1, 1, 'piece', '~1 piece'), q(2, 2, 'piece', '~2 pieces')],
  },
  { displayName: 'Tomato', foodGroup: 'vegFruit', presets: [q(1, 1, 'piece', '~1 piece')] },
  { displayName: 'Avocado', foodGroup: 'vegFruit', presets: [q(0.5, 1, 'piece', '~½–1 piece')] },
  { displayName: 'Strawberries', foodGroup: 'vegFruit', presets: [q(0.5, 1, 'cup', '~½–1 cup')] },
  {
    displayName: 'Salmon',
    foodGroup: 'protein',
    presets: [q(1, 1, 'fist', '~1 fist'), q(1.5, 1.5, 'fist', '~1.5 fists')],
  },
  { displayName: 'Chicken Breast', foodGroup: 'protein', presets: [q(1, 1, 'fist', '~1 fist')] },
  {
    displayName: 'Eggs',
    foodGroup: 'protein',
    presets: [q(1, 2, 'piece', '~1–2 pieces'), q(3, 3, 'piece', '~3 pieces')],
  },
  { displayName: 'Tofu', foodGroup: 'protein', presets: [q(0.5, 1, 'cup', '~½–1 cup')] },
  { displayName: 'Beef', foodGroup: 'protein', presets: [q(1, 1, 'fist', '~1 fist')] },
  { displayName: 'Tuna', foodGroup: 'protein', presets: [q(1, 1, 'can', '~1 can')] },
  { displayName: 'Lentils', foodGroup: 'protein', presets: [q(0.5, 1, 'cup', '~½–1 cup')] },
  { displayName: 'Chickpeas', foodGroup: 'protein', presets: [q(0.5, 1, 'cup', '~½–1 cup')] },
  {
    displayName: 'Rice',
    foodGroup: 'starch',
    presets: [q(1, 1, 'cup', '~1 cup'), q(2, 2, 'cup', '~2 cups')],
  },
  { displayName: 'Pasta', foodGroup: 'starch', presets: [q(1, 1, 'cup', '~1 cup')] },
  { displayName: 'Bread', foodGroup: 'starch', presets: [q(1, 2, 'slice', '~1–2 slices')] },
  { displayName: 'Potato', foodGroup: 'starch', presets: [q(1, 1, 'piece', '~1 piece')] },
  { displayName: 'Quinoa', foodGroup: 'starch', presets: [q(0.5, 1, 'cup', '~½–1 cup')] },
  { displayName: 'Oats', foodGroup: 'starch', presets: [q(0.5, 1, 'cup', '~½–1 cup')] },
  { displayName: 'Sweet Potato', foodGroup: 'starch', presets: [q(1, 1, 'piece', '~1 piece')] },
  { displayName: 'Tortilla', foodGroup: 'starch', presets: [q(1, 2, 'piece', '~1–2 pieces')] },
  {
    displayName: 'Yogurt',
    foodGroup: 'dairy',
    presets: [q(0.5, 1, 'cup', '~½–1 cup'), q(1, 1, 'cup', '~1 cup')],
  },
  { displayName: 'Milk', foodGroup: 'dairy', presets: [q(1, 1, 'cup', '~1 cup')] },
  { displayName: 'Cheese', foodGroup: 'dairy', presets: [q(1, 2, 'slice', '~1–2 slices')] },
  { displayName: 'Cottage Cheese', foodGroup: 'dairy', presets: [q(0.5, 1, 'cup', '~½–1 cup')] },
  { displayName: 'Butter', foodGroup: 'dairy', presets: [q(1, 1, 'tbsp', '~1 tbsp')] },
  { displayName: 'Greek Yogurt', foodGroup: 'dairy', presets: [q(0.5, 1, 'cup', '~½–1 cup')] },
  { displayName: 'Kefir', foodGroup: 'dairy', presets: [q(1, 1, 'cup', '~1 cup')] },
  { displayName: 'Mixed Nuts', foodGroup: 'other', presets: [q(1, 2, 'handful', '~1–2 handfuls')] },
  { displayName: 'Olive Oil', foodGroup: 'other', presets: [q(1, 1, 'tbsp', '~1 tbsp')] },
  {
    displayName: 'Dark Chocolate',
    foodGroup: 'other',
    presets: [q(1, 2, 'square', '~1–2 squares')],
  },
];
