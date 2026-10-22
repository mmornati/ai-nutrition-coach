import { useState } from 'react';
import type { FoodEntryDraft, Recipe, SavedMeal } from '@anc/core';
import { foodName } from '../../catalog';
import { Button } from '../../components/primitives';
import { Sheet } from '../../components/sheets';
import { fill, plural, useLocale, useMessage, useStrings } from '../../i18n';
import { useSession } from '../../app/session';
import { MealEditor } from './MealEditor';
import { useSavedLists } from './use-saved';

function Row({
  title,
  detail,
  onSelect,
}: {
  readonly title: string;
  readonly detail: string;
  readonly onSelect: () => void;
}) {
  return (
    <li className="border-seam border-b">
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-14 w-full cursor-pointer flex-col items-start justify-center gap-0.5 bg-transparent py-2 text-left"
      >
        <span className="text-lead">{title}</span>
        <span className="text-body-small text-ink-soft">{detail}</span>
      </button>
    </li>
  );
}

function SavedBody({
  onLogged,
  onFindRecipe,
  onNewRecipe,
  onChosen,
  chosen,
}: {
  readonly onLogged: () => void;
  readonly onFindRecipe: (name: string) => void;
  readonly onNewRecipe: () => void;
  readonly onChosen: (meal: SavedMeal | null) => void;
  readonly chosen: SavedMeal | null;
}) {
  const t = useStrings().relog;
  const { locale } = useLocale();
  const { recordPlate } = useSession();
  const { status, meals, recipes } = useSavedLists();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useMessage();

  const log = async (drafts: readonly FoodEntryDraft[]) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await recordPlate(drafts);
      if (result.kind === 'recordPlateSuccess') {
        onLogged();
        return;
      }
      setNote((a) => a.common.logFailed);
    } catch {
      setNote((a) => a.common.logFailed);
    } finally {
      setBusy(false);
    }
  };

  const summary = (meal: SavedMeal): string =>
    meal.entries.map((e) => foodName(e.databaseFood, locale)).join(', ');
  const recipeDetail = (r: Recipe): string => plural(t.recipeServings, r.servings);

  if (chosen !== null) {
    return (
      <>
        <MealEditor entries={chosen.entries} busy={busy} onLog={(d) => void log(d)} />
        <p role="status" className="text-body-small text-ink-soft empty:hidden">
          {note}
        </p>
        <Button variant="secondary" fullWidth onClick={() => onChosen(null)}>
          {t.backToSaved}
        </Button>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {status === 'failed' && (
        <p role="status" className="text-body-small text-ink-soft">
          {t.savedCannotLoad}
        </p>
      )}
      {status === 'ready' && meals.length === 0 && recipes.length === 0 && (
        <p className="text-body-small text-ink-soft">{t.savedEmpty}</p>
      )}
      {meals.length > 0 && (
        <section aria-labelledby="saved-meals-heading" className="flex flex-col gap-1">
          <h3 id="saved-meals-heading" className="font-display text-section text-thread mb-1">
            {t.savedMeals}
          </h3>
          <ul className="border-ink border-t-2">
            {meals.map((meal) => (
              <Row
                key={meal.id}
                title={meal.name}
                detail={`${plural(t.mealFoods, meal.entries.length)} · ${summary(meal)}`}
                onSelect={() => onChosen(meal)}
              />
            ))}
          </ul>
        </section>
      )}
      {recipes.length > 0 && (
        <section aria-labelledby="saved-recipes-heading" className="flex flex-col gap-1">
          <h3 id="saved-recipes-heading" className="font-display text-section text-thread mb-1">
            {t.savedRecipes}
          </h3>
          <ul className="border-ink border-t-2">
            {recipes.map((recipe) => (
              <Row
                key={recipe.id}
                title={recipe.name}
                detail={`${recipeDetail(recipe)} · ${t.useRecipe}`}
                onSelect={() => onFindRecipe(recipe.name)}
              />
            ))}
          </ul>
        </section>
      )}
      <Button variant="secondary" fullWidth onClick={onNewRecipe}>
        {t.newRecipe}
      </Button>
    </div>
  );
}

/**
 * Saved meals and recipes, from the capture sheet. A meal opens with its saved amounts (change
 * any, then log: a new plate through the normal path); a recipe opens the food search on its name,
 * where its servings are the presets.
 */
export function SavedSheet({
  open,
  onClose,
  onLogged,
  onFindRecipe,
  onNewRecipe,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onLogged: () => void;
  readonly onFindRecipe: (name: string) => void;
  readonly onNewRecipe: () => void;
}) {
  const t = useStrings().relog;
  const [chosen, setChosen] = useState<SavedMeal | null>(null);
  const close = () => {
    setChosen(null);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title={chosen === null ? t.savedTitle : fill(t.logMealTitle, { name: chosen.name })}
    >
      <SavedBody
        chosen={chosen}
        onChosen={setChosen}
        onLogged={() => {
          setChosen(null);
          onLogged();
        }}
        onFindRecipe={(name) => {
          setChosen(null);
          onFindRecipe(name);
        }}
        onNewRecipe={() => {
          setChosen(null);
          onNewRecipe();
        }}
      />
    </Sheet>
  );
}
