import type { EpochMs } from '../common';
import type { FoodEntryDraft } from '../value-types/food-entry-draft';

/** Longest name a saved meal or a recipe may have, in characters. */
export const MAX_SAVED_NAME_LENGTH = 80;

/**
 * Trim, collapse inner whitespace and cap the length. `null` when nothing is left: a saved meal
 * or a recipe always has a name the person can recognise.
 */
export function cleanSavedName(raw: string): string | null {
  const collapsed = raw.replace(/\s+/gu, ' ').trim();
  if (collapsed === '') return null;
  return Array.from(collapsed).slice(0, MAX_SAVED_NAME_LENGTH).join('').trim();
}

/**
 * A template of foods and quantities the person chose to keep ("my usual breakfast"). Entries are
 * drafts: logging one makes a NEW plate with the same food snapshots (nutrients included).
 */
export interface SavedMeal {
  readonly id: number;
  readonly name: string;
  readonly createdAtUtc: EpochMs;
  readonly entries: readonly FoodEntryDraft[];
}

/**
 * A home recipe: ingredients with grams, a number of servings and, optionally, the weight of the
 * whole dish once cooked. Its per-serving values are derived (see `computeRecipe`), never stored.
 */
export interface Recipe {
  readonly id: number;
  readonly name: string;
  readonly createdAtUtc: EpochMs;
  readonly servings: number;
  /** Weight of the finished dish in grams; absent = not weighed. */
  readonly cookedWeightGrams?: number;
  readonly ingredients: readonly FoodEntryDraft[];
}

export interface NewSavedMeal {
  readonly name: string;
  readonly entries: readonly FoodEntryDraft[];
}

export interface NewRecipe {
  readonly name: string;
  readonly servings: number;
  readonly cookedWeightGrams?: number | undefined;
  readonly ingredients: readonly FoodEntryDraft[];
}
