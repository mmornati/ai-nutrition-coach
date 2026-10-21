import type { NewRecipe, NewSavedMeal, Recipe, SavedMeal } from '../entities/saved-meal';
import type { SavedResult } from '../results/saved';

/**
 * The person's own templates: saved meals and home recipes. Stored in the same encrypted store as
 * their plates; erased with it. Newest first.
 */
export interface SavedStore {
  listMeals(): Promise<SavedResult<readonly SavedMeal[]>>;
  saveMeal(input: NewSavedMeal): Promise<SavedResult<SavedMeal>>;
  renameMeal(id: number, name: string): Promise<SavedResult<null>>;
  /** Idempotent: an unknown id succeeds. */
  deleteMeal(id: number): Promise<SavedResult<null>>;
  listRecipes(): Promise<SavedResult<readonly Recipe[]>>;
  saveRecipe(input: NewRecipe): Promise<SavedResult<Recipe>>;
  /** Idempotent: an unknown id succeeds. Plates that used the recipe keep their snapshot. */
  deleteRecipe(id: number): Promise<SavedResult<null>>;
}
