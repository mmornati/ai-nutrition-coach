import { useState } from 'react';
import { cleanSavedName, type Recipe, type SavedMeal } from '@anc/core';
import { foodName } from '../../catalog';
import { ConfirmDialog } from '../../components/dialogs';
import { Button, TextField } from '../../components/primitives';
import { fill, plural, useLocale, useMessage, useStrings } from '../../i18n';
import { useSession } from '../../app/session';
import { RecipeEditorSheet } from '../log/RecipeEditor';
import { useSavedLists } from '../log/use-saved';
import { Prose, Section, SettingsPage } from './SettingsPage';

type Target =
  | { readonly kind: 'meal'; readonly meal: SavedMeal }
  | { readonly kind: 'recipe'; readonly recipe: Recipe };

/**
 * Settings, Saved meals: the meals and recipes the person keeps. A meal can be renamed or
 * deleted, a recipe deleted (or a new one written). Deleting never touches plates already logged
 * from them: a plate keeps its own copy of the foods.
 */
export function SavedScreen() {
  const t = useStrings().relog;
  const { locale } = useLocale();
  const { saved } = useSession();
  const { status, meals, recipes, reload } = useSavedLists();
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [removing, setRemoving] = useState<Target | null>(null);
  const [newRecipe, setNewRecipe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useMessage();

  const rename = async () => {
    if (renaming === null || busy) return;
    if (cleanSavedName(renaming.name) === null) {
      setNote((a) => a.relog.nameNeeded);
      return;
    }
    setBusy(true);
    let ok: boolean;
    try {
      ok = (await saved.renameMeal(renaming.id, renaming.name)).kind === 'saved';
    } catch {
      ok = false;
    }
    setBusy(false);
    if (!ok) {
      setNote((a) => a.common.logFailed);
      return;
    }
    setRenaming(null);
    setNote((a) => a.relog.renamed);
    await reload();
  };

  const remove = async () => {
    const target = removing;
    if (target === null || busy) return;
    setBusy(true);
    let ok: boolean;
    try {
      const result =
        target.kind === 'meal'
          ? await saved.deleteMeal(target.meal.id)
          : await saved.deleteRecipe(target.recipe.id);
      ok = result.kind === 'saved';
    } catch {
      ok = false;
    }
    setBusy(false);
    setRemoving(null);
    setNote((a) => (ok ? a.relog.removed : a.common.logFailed));
    if (ok) await reload();
  };

  const removingName =
    removing === null ? '' : removing.kind === 'meal' ? removing.meal.name : removing.recipe.name;

  return (
    <SettingsPage title={t.savedTitle}>
      {status === 'failed' && <Prose>{t.savedCannotLoad}</Prose>}
      {status === 'ready' && meals.length === 0 && recipes.length === 0 && (
        <Prose>{t.savedEmpty}</Prose>
      )}

      {meals.length > 0 && (
        <Section title={t.savedMeals}>
          <ul className="border-porcelain border-t-2">
            {meals.map((meal) => (
              <li key={meal.id} className="border-rule border-b py-3">
                {renaming?.id === meal.id ? (
                  <div className="flex flex-col gap-3">
                    <TextField
                      label={t.renameField}
                      value={renaming.name}
                      autoComplete="off"
                      data-autofocus
                      onChange={(e) => {
                        setNote(null);
                        setRenaming({ id: meal.id, name: e.target.value });
                      }}
                    />
                    <div className="flex gap-3">
                      <Button className="flex-1" busy={busy} onClick={() => void rename()}>
                        {t.renameSave}
                      </Button>
                      <Button
                        variant="outline-porcelain"
                        className="flex-1"
                        onClick={() => setRenaming(null)}
                      >
                        {t.cancel}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-lead">
                      {meal.name}
                      <span className="text-body-small text-porcelain-dim block">
                        {plural(t.mealFoods, meal.entries.length)} ·{' '}
                        {meal.entries.map((e) => foodName(e.databaseFood, locale)).join(', ')}
                      </span>
                    </span>
                    <span className="flex shrink-0">
                      <button
                        type="button"
                        aria-label={fill(t.renameOf, { name: meal.name })}
                        onClick={() => setRenaming({ id: meal.id, name: meal.name })}
                        className="text-body-small text-porcelain-dim min-h-12 min-w-14 cursor-pointer bg-transparent px-2 underline underline-offset-4"
                      >
                        {t.rename}
                      </button>
                      <button
                        type="button"
                        aria-label={fill(t.removeOf, { name: meal.name })}
                        onClick={() => setRemoving({ kind: 'meal', meal })}
                        className="text-body-small text-porcelain-dim min-h-12 min-w-14 cursor-pointer bg-transparent px-2 underline underline-offset-4"
                      >
                        {t.remove}
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recipes.length > 0 && (
        <Section title={t.savedRecipes}>
          <ul className="border-porcelain border-t-2">
            {recipes.map((recipe) => (
              <li
                key={recipe.id}
                className="border-rule flex items-start justify-between gap-3 border-b py-3"
              >
                <span className="min-w-0 text-lead">
                  {recipe.name}
                  <span className="text-body-small text-porcelain-dim block">
                    {plural(t.recipeServings, recipe.servings)} ·{' '}
                    {plural(t.mealFoods, recipe.ingredients.length)}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={fill(t.removeOf, { name: recipe.name })}
                  onClick={() => setRemoving({ kind: 'recipe', recipe })}
                  className="text-body-small text-porcelain-dim min-h-12 min-w-14 shrink-0 cursor-pointer bg-transparent px-2 underline underline-offset-4"
                >
                  {t.remove}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
        {note}
      </p>
      <Button variant="outline-porcelain" onClick={() => setNewRecipe(true)}>
        {t.newRecipe}
      </Button>

      <RecipeEditorSheet
        open={newRecipe}
        onClose={() => setNewRecipe(false)}
        onSaved={(recipe) => {
          setNewRecipe(false);
          setNote((a) => fill(a.relog.recipe.saved, { name: recipe.name }));
          void reload();
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        title={fill(t.removeTitle, { name: removingName })}
        body={<p>{t.removeBody}</p>}
        confirmLabel={t.remove}
        dismissLabel={t.removeKeep}
        onConfirm={() => void remove()}
        onDismiss={() => setRemoving(null)}
        busy={busy}
      />
    </SettingsPage>
  );
}
