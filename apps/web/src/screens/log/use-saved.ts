import { useCallback, useEffect, useState } from 'react';
import type { Recipe, SavedMeal } from '@anc/core';
import { useSession } from '../../app/session';

export interface SavedLists {
  readonly status: 'loading' | 'ready' | 'failed';
  readonly meals: readonly SavedMeal[];
  readonly recipes: readonly Recipe[];
  /** Read both lists again (after a rename, a delete or a new recipe). */
  readonly reload: () => Promise<void>;
}

/** The person's saved meals and recipes, read when the view opens. A failed read is a calm line. */
export function useSavedLists(): SavedLists {
  const { saved, live } = useSession();
  const [state, setState] = useState<Omit<SavedLists, 'reload'>>({
    status: 'loading',
    meals: [],
    recipes: [],
  });
  const reload = useCallback(async () => {
    let next: Omit<SavedLists, 'reload'>;
    try {
      const [meals, recipes] = await Promise.all([saved.listMeals(), saved.listRecipes()]);
      next =
        meals.kind === 'saved' && recipes.kind === 'saved'
          ? { status: 'ready', meals: meals.value, recipes: recipes.value }
          : { status: 'failed', meals: [], recipes: [] };
    } catch {
      next = { status: 'failed', meals: [], recipes: [] };
    }
    if (live()) setState(next);
  }, [saved, live]);
  useEffect(() => {
    // Read once when the view opens; `reload` sets state after the awaited read.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- an async read, not a cascading render.
    void reload();
  }, [reload]);
  return { ...state, reload };
}
