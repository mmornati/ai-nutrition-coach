import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Recipe, SavedMeal } from '@anc/core';
import { useSession } from '../../app/session';

export interface SavedLists {
  readonly status: 'loading' | 'ready' | 'failed';
  readonly meals: readonly SavedMeal[];
  readonly recipes: readonly Recipe[];
  /** Read both lists again (after a rename, a delete or a new recipe). */
  readonly reload: () => Promise<void>;
}

/**
 * The person's saved meals and recipes, read when the view opens and again when a copy pulled from
 * the server changed what this device holds (a meal renamed or a recipe added on another device).
 * The lists are replaced in place; a name being typed or a sheet being open keeps its own state.
 * A failed read is a calm line.
 */
export function useSavedLists(): SavedLists {
  const { saved, live, sync } = useSession();
  const pulled = useSyncExternalStore(sync.onRemoteChange, sync.getRemoteRevision, () => 0);
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
    // Read when the view opens and after each pull that changed something; `reload` sets state
    // after the awaited read.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- an async read, not a cascading render.
    void reload();
  }, [reload, pulled]);
  return { ...state, reload };
}
