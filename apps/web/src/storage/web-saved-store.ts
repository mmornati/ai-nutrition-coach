// The web `SavedStore`: the person's saved meals and home recipes (schema v3), a thin view over the
// controller's open database. While the store is locked every call answers a typed `locked`
// failure; nothing throws across the port. Names are cleaned at this boundary, entries are checked
// again (valid quantity, a weight on every recipe ingredient), and food snapshots go through the
// same sanitisers as a logged plate.

import {
  cleanSavedName,
  databaseFood,
  isValidQuantity,
  recipeProblem,
  savedFailed,
  savedOk,
  type EpochMs,
  type FoodEntryDraft,
  type NewRecipe,
  type NewSavedMeal,
  type Recipe,
  type SavedMeal,
  type SavedResult,
  type SavedStore,
} from '@anc/core';
import { reportCorruptRow, type CorruptRowReporter } from './corrupt-row-log';
import { isProgrammingError, SessionClosedError } from './errors';
import { mapRecipes, mapSavedMeals, toStoredInstant } from './row-mapping';
import type { StoreSource } from './store-source';
import { toInsert } from './web-encrypted-store';

/** What was actually stored: the food went through the same sanitisers as a logged plate. */
const stored = (draft: FoodEntryDraft): FoodEntryDraft => ({
  databaseFood: databaseFood(draft.databaseFood),
  quantity: { ...draft.quantity },
});

const entriesValid = (entries: readonly FoodEntryDraft[]): boolean =>
  entries.length > 0 && entries.every((e) => isValidQuantity(e.quantity));

export class WebSavedStore implements SavedStore {
  constructor(
    private readonly source: StoreSource,
    private readonly options: { now?: () => EpochMs; onCorruptRow?: CorruptRowReporter } = {},
  ) {}

  private report: CorruptRowReporter = (id, reason) =>
    (this.options.onCorruptRow ?? reportCorruptRow)(id, reason);

  private now(): EpochMs {
    return Math.floor((this.options.now ?? Date.now)());
  }

  /** Run `work` against the open database; a locked store or a storage error is a typed failure. */
  private async run<T>(
    work: (db: NonNullable<ReturnType<StoreSource['database']>>) => Promise<SavedResult<T>>,
  ): Promise<SavedResult<T>> {
    const db = this.source.database();
    if (!db) return savedFailed('locked');
    try {
      return await work(db);
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      return savedFailed(error instanceof SessionClosedError ? 'locked' : 'storeOperation');
    }
  }

  listMeals(): Promise<SavedResult<readonly SavedMeal[]>> {
    return this.run(async (db) => savedOk(mapSavedMeals(await db.readSavedMeals(), this.report)));
  }

  saveMeal(input: NewSavedMeal): Promise<SavedResult<SavedMeal>> {
    const name = cleanSavedName(input.name);
    if (name === null || !entriesValid(input.entries))
      return Promise.resolve(savedFailed('invalid'));
    return this.run(async (db) => {
      const createdAtUtc = this.now();
      const id = await db.insertSavedMeal(
        name,
        toStoredInstant(createdAtUtc),
        input.entries.map(toInsert),
      );
      return savedOk({ id, name, createdAtUtc, entries: input.entries.map(stored) });
    });
  }

  renameMeal(id: number, rawName: string): Promise<SavedResult<null>> {
    const name = cleanSavedName(rawName);
    if (name === null) return Promise.resolve(savedFailed('invalid'));
    return this.run(async (db) => {
      await db.renameSavedMeal(id, name);
      return savedOk(null);
    });
  }

  deleteMeal(id: number): Promise<SavedResult<null>> {
    return this.run(async (db) => {
      await db.deleteSavedMeal(id);
      return savedOk(null);
    });
  }

  listRecipes(): Promise<SavedResult<readonly Recipe[]>> {
    return this.run(async (db) => savedOk(mapRecipes(await db.readRecipes(), this.report)));
  }

  saveRecipe(input: NewRecipe): Promise<SavedResult<Recipe>> {
    const name = cleanSavedName(input.name);
    if (name === null || !entriesValid(input.ingredients) || recipeProblem(input) !== null) {
      return Promise.resolve(savedFailed('invalid'));
    }
    return this.run(async (db) => {
      const createdAtUtc = this.now();
      const id = await db.insertRecipe(
        name,
        input.servings,
        input.cookedWeightGrams === undefined ? null : String(input.cookedWeightGrams),
        toStoredInstant(createdAtUtc),
        input.ingredients.map(toInsert),
      );
      return savedOk({
        id,
        name,
        createdAtUtc,
        servings: input.servings,
        ...(input.cookedWeightGrams === undefined
          ? {}
          : { cookedWeightGrams: input.cookedWeightGrams }),
        ingredients: input.ingredients.map(stored),
      });
    });
  }

  deleteRecipe(id: number): Promise<SavedResult<null>> {
    return this.run(async (db) => {
      await db.deleteRecipe(id);
      return savedOk(null);
    });
  }
}
