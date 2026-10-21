import { useMemo, useState } from 'react';
import {
  cleanSavedName,
  computeRecipe,
  MAX_COOKED_WEIGHT_GRAMS,
  MAX_INGREDIENTS,
  MAX_SERVINGS,
  recipeProblem,
  type FoodEntryDraft,
  type Recipe,
  type RecipeProblem,
} from '@anc/core';
import { foodName, useManualEntry } from '../../catalog';
import {
  entryQuantityText,
  formatWhole,
  formatWeight,
  previewLine,
  useShowNumbers,
} from '../../components/nutrition';
import { Button, TextField } from '../../components/primitives';
import { QuantityPicker, Sheet } from '../../components/sheets';
import { fill, useLocale, useMessage, useStrings, type Message, type Strings } from '../../i18n';
import { useSession } from '../../app/session';
import type { RecipePrefill } from '../../capture';
import { MatchList } from './MatchList';
import { RecipePaste } from './RecipePaste';

/** A typed whole number of servings; `null` for anything else. */
function parseServings(text: string): number | null {
  const t = text.trim();
  return /^\d{1,3}$/.test(t) ? Number(t) : null;
}

/** A typed cooked weight in grams (comma or dot); empty is "not weighed"; `null` is not a number. */
function parseCooked(text: string): number | undefined | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return undefined;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n <= MAX_COOKED_WEIGHT_GRAMS ? n : null;
}

const servingsText = (a: Strings): string =>
  fill(a.relog.recipe.badServings, { max: formatWhole(MAX_SERVINGS) });
const cookedText = (a: Strings): string =>
  fill(a.relog.recipe.badCooked, { max: formatWhole(MAX_COOKED_WEIGHT_GRAMS) });
const tooManyText = (a: Strings): string =>
  fill(a.relog.recipe.tooMany, { max: formatWhole(MAX_INGREDIENTS) });

const PROBLEM: Readonly<Record<RecipeProblem, Message>> = {
  noIngredients: (a) => a.relog.recipe.needsIngredient,
  tooManyIngredients: tooManyText,
  ingredientWithoutGrams: (a) => a.relog.recipe.needsGrams,
  badServings: servingsText,
  badCookedWeight: cookedText,
  cookedWeightImplausible: (a) => a.relog.recipe.cookedImplausible,
  servingTooHeavy: (a) => a.relog.recipe.heavy,
};

/**
 * A home recipe: a name, ingredients found in the food search (each with grams), the number of
 * servings and, optionally, the weight of the finished dish. The per-serving values are worked out
 * from the ingredients as they are added; an ingredient without nutrient data is named as missing,
 * never counted as zero.
 */
export function RecipeEditor({
  onSaved,
  onLeave,
}: {
  readonly onSaved: (recipe: Recipe) => void;
  /** Called when a link inside leaves for another page (the sheet closes). */
  readonly onLeave?: () => void;
}) {
  const all = useStrings();
  const t = all.relog.recipe;
  const { locale } = useLocale();
  const { catalog, saved } = useSession();
  const showNumbers = useShowNumbers();
  const { session, state } = useManualEntry(catalog);
  const [name, setName] = useState('');
  const [servings, setServings] = useState('4');
  const [cooked, setCooked] = useState('');
  const [ingredients, setIngredients] = useState<readonly FoodEntryDraft[]>([]);
  const [weightValid, setWeightValid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [notAdded, setNotAdded] = useState<readonly string[]>([]);
  const [estimatedNote, setEstimatedNote] = useState(false);
  const [note, setNote] = useMessage();

  const selected = state.selected;
  const chosen = state.chosenPreset ?? selected?.presets[0] ?? null;
  const servingsN = parseServings(servings);
  const cookedN = parseCooked(cooked);

  const summary = useMemo(() => {
    if (ingredients.length === 0 || servingsN === null || servingsN < 1) return null;
    const input = {
      ingredients,
      servings: servingsN,
      ...(cookedN === null || cookedN === undefined ? {} : { cookedWeightGrams: cookedN }),
    };
    return recipeProblem(input) === null ? computeRecipe(input) : null;
  }, [ingredients, servingsN, cookedN]);

  const add = () => {
    if (selected === null || chosen === null) return;
    if (chosen.grams === undefined) {
      setNote((a) => a.relog.recipe.needsGrams);
      return;
    }
    setNote(null);
    setIngredients((all) => [...all, { databaseFood: selected.food, quantity: chosen }]);
    session.clear();
  };

  /** A pasted recipe fills in the form for review: nothing is saved. */
  const applyPaste = (prefill: RecipePrefill, why: Message) => {
    if (prefill.name !== undefined && cleanSavedName(name) === null) setName(prefill.name);
    if (prefill.servings !== undefined) setServings(String(prefill.servings));
    setIngredients((current) => [...current, ...prefill.ingredients].slice(0, MAX_INGREDIENTS));
    setNotAdded(prefill.notAdded);
    setEstimatedNote(prefill.anyEstimated);
    setPasting(false);
    setNote(why);
  };

  const save = async () => {
    if (busy) return;
    if (cleanSavedName(name) === null) {
      setNote((a) => a.relog.recipe.needsName);
      return;
    }
    if (servingsN === null) {
      setNote(servingsText);
      return;
    }
    if (cookedN === null) {
      setNote(cookedText);
      return;
    }
    const input = {
      name,
      servings: servingsN,
      cookedWeightGrams: cookedN,
      ingredients,
    };
    const problem = recipeProblem(input);
    if (problem !== null) {
      setNote(PROBLEM[problem]);
      return;
    }
    setBusy(true);
    try {
      const result = await saved.saveRecipe(input);
      if (result.kind === 'saved') {
        onSaved(result.value);
        return;
      }
      setNote((a) => a.common.logFailed);
    } catch {
      setNote((a) => a.common.logFailed);
    } finally {
      setBusy(false);
    }
  };

  const perServingValues =
    summary === null || !showNumbers
      ? null
      : previewLine(
          summary.per100g === undefined
            ? undefined
            : {
                sourceRef: 'recipe:draft',
                displayName: name,
                source: 'recipe',
                foodGroup: 'other',
                nutrientsPer100g: summary.per100g,
              },
          summary.perServingGrams,
          locale,
        );

  return (
    <div className="flex flex-col gap-5">
      <TextField
        label={t.name}
        value={name}
        autoComplete="off"
        onChange={(e) => {
          setNote(null);
          setName(e.target.value);
        }}
      />

      {pasting ? (
        <RecipePaste
          onResult={applyPaste}
          onClose={() => setPasting(false)}
          onLeave={() => onLeave?.()}
        />
      ) : (
        <Button variant="outline-porcelain" fullWidth onClick={() => setPasting(true)}>
          {t.pasteOpen}
        </Button>
      )}

      <section aria-labelledby="recipe-ingredients" className="flex flex-col gap-3">
        <h3
          id="recipe-ingredients"
          className="font-display text-section text-signal-muted uppercase"
        >
          {t.ingredients}
        </h3>
        {ingredients.length === 0 ? (
          <p className="text-body-small text-porcelain-dim">{t.none}</p>
        ) : (
          <ul className="border-porcelain border-t-2">
            {ingredients.map((item, i) => {
              const itemName = foodName(item.databaseFood, locale);
              return (
                <li
                  key={`${item.databaseFood.sourceRef}:${i}`}
                  className="border-rule flex items-center justify-between gap-3 border-b py-2"
                >
                  <span className="min-w-0 text-lead">
                    {itemName}
                    <span className="text-body-small text-porcelain-dim block">
                      {entryQuantityText(item.quantity, locale)}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={fill(t.removeIngredientOf, { name: itemName })}
                    onClick={() => setIngredients((all) => all.filter((_, j) => j !== i))}
                    className="text-body-small text-porcelain-dim min-h-12 min-w-14 shrink-0 cursor-pointer bg-transparent px-2 underline underline-offset-4"
                  >
                    {t.removeIngredient}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {estimatedNote && <p className="text-body-small text-porcelain-dim">{t.pasteEstimated}</p>}
        {notAdded.length > 0 && (
          <div className="border-rule flex flex-col gap-2 border-2 p-3">
            <h4 className="font-display text-label text-signal-muted uppercase">
              {t.notAddedTitle}
            </h4>
            <p className="text-body-small text-porcelain-dim">{t.notAddedBody}</p>
            <ul className="text-body-small list-disc pl-5">
              {notAdded.map((line, i) => (
                <li key={`${i}:${line}`}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        <TextField
          label={t.search}
          value={state.query}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => {
            setNote(null);
            void session.updateQuery(e.target.value);
          }}
        />
        {state.matches.length > 0 && (
          <MatchList
            matches={state.matches}
            selected={selected}
            onSelect={(match) => session.selectMatch(match)}
          />
        )}
        {selected && chosen && (
          <>
            <QuantityPicker
              key={selected.food.sourceRef}
              food={selected.food}
              presets={selected.presets}
              value={chosen}
              onChange={(preset) => session.selectPreset(preset)}
              onValidityChange={setWeightValid}
            />
            <Button
              variant="outline-porcelain"
              fullWidth
              disabled={!weightValid || ingredients.length >= MAX_INGREDIENTS}
              onClick={add}
            >
              {t.add}
            </Button>
          </>
        )}
        {ingredients.length >= MAX_INGREDIENTS && (
          <p className="text-body-small text-porcelain-dim">{tooManyText(all)}</p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={t.servings}
          value={servings}
          inputMode="numeric"
          autoComplete="off"
          onChange={(e) => {
            setNote(null);
            setServings(e.target.value);
          }}
        />
        <TextField
          label={t.cooked}
          value={cooked}
          inputMode="decimal"
          autoComplete="off"
          onChange={(e) => {
            setNote(null);
            setCooked(e.target.value);
          }}
        />
      </div>
      <p className="text-body-small text-porcelain-dim">{t.cookedHint}</p>

      {summary !== null && (
        <div className="text-body-small flex flex-col gap-1">
          <p>
            {fill(t.perServing, {
              weight: formatWeight(summary.perServingGrams, !summary.cookedWeightKnown, locale),
            })}
          </p>
          {perServingValues !== null && (
            <p>{fill(t.perServingValues, { values: perServingValues })}</p>
          )}
          {summary.partial && showNumbers && (
            <p className="text-porcelain-dim">
              {fill(t.partial, {
                counted: summary.ingredientsCounted,
                total: summary.ingredientsTotal,
              })}
            </p>
          )}
        </div>
      )}

      {/* Always mounted: a live region is announced reliably only when its text changes. */}
      <p role="status" className="text-body-small text-porcelain-dim empty:hidden">
        {note}
      </p>
      <Button fullWidth busy={busy} onClick={() => void save()}>
        {t.save}
      </Button>
    </div>
  );
}

/** The recipe editor as a sheet (from the capture flow and from Settings, Saved meals). */
export function RecipeEditorSheet({
  open,
  onClose,
  onSaved,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSaved: (recipe: Recipe) => void;
}) {
  const t = useStrings().relog.recipe;
  return (
    <Sheet open={open} onClose={onClose} title={t.title}>
      <RecipeEditor onSaved={onSaved} onLeave={onClose} />
    </Sheet>
  );
}
