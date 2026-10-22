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
import type { NotAddedLine, PrefillIngredient, RecipePrefill } from '../../capture';
import { MatchList } from './MatchList';
import { RecipePaste } from './RecipePaste';

/** An ingredient of the form and, when it came from a pasted recipe, the line it was matched from. */
interface IngredientRow {
  readonly draft: FoodEntryDraft;
  readonly from?: string;
}

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
  // Each ingredient, with the pasted line it was matched from (shown next to the matched name).
  const [rows, setRows] = useState<readonly IngredientRow[]>([]);
  const ingredients = useMemo<readonly FoodEntryDraft[]>(() => rows.map((r) => r.draft), [rows]);
  const [weightValid, setWeightValid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [notAdded, setNotAdded] = useState<readonly NotAddedLine[]>([]);
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
    setRows((all) => [...all, { draft: { databaseFood: selected.food, quantity: chosen } }]);
    session.clear();
  };

  /** A pasted recipe fills in the form for review: nothing is saved. */
  const applyPaste = (prefill: RecipePrefill, why: Message) => {
    if (prefill.name !== undefined && cleanSavedName(name) === null) setName(prefill.name);
    if (prefill.servings !== undefined) setServings(String(prefill.servings));
    setRows((current) =>
      [...current, ...prefill.ingredients.map((i) => ({ draft: i.draft, from: i.from }))].slice(
        0,
        MAX_INGREDIENTS,
      ),
    );
    setNotAdded(prefill.notAdded);
    setEstimatedNote(prefill.anyEstimated);
    setPasting(false);
    setNote(why);
  };

  /** One tap on a suggestion: it becomes an ingredient and its line leaves the list. */
  const pickSuggestion = (index: number, suggestion: PrefillIngredient) => {
    setRows((current) =>
      current.length >= MAX_INGREDIENTS
        ? current
        : [...current, { draft: suggestion.draft, from: suggestion.from }],
    );
    setNotAdded((current) => current.filter((_, i) => i !== index));
    setNote(null);
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
        <Button variant="secondary" fullWidth onClick={() => setPasting(true)}>
          {t.pasteOpen}
        </Button>
      )}

      <section aria-labelledby="recipe-ingredients" className="flex flex-col gap-3">
        <h3 id="recipe-ingredients" className="font-display text-section text-thread">
          {t.ingredients}
        </h3>
        {ingredients.length === 0 ? (
          <p className="text-body-small text-ink-soft">{t.none}</p>
        ) : (
          <ul className="border-ink border-t-2">
            {rows.map(({ draft: item, from }, i) => {
              const itemName = foodName(item.databaseFood, locale);
              return (
                <li
                  key={`${item.databaseFood.sourceRef}:${i}`}
                  className="border-seam flex items-center justify-between gap-3 border-b py-2"
                >
                  <span className="min-w-0 text-lead">
                    {from !== undefined && (
                      <span className="text-body-small text-ink-soft block">
                        {fill(t.matchedFrom, { line: from })}
                      </span>
                    )}
                    {itemName}
                    <span className="text-body-small text-ink-soft block">
                      {entryQuantityText(item.quantity, locale)}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={fill(t.removeIngredientOf, { name: itemName })}
                    onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                    className="text-body-small text-ink-soft min-h-12 min-w-14 shrink-0 cursor-pointer bg-transparent px-2 underline underline-offset-4"
                  >
                    {t.removeIngredient}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {estimatedNote && <p className="text-body-small text-ink-soft">{t.pasteEstimated}</p>}
        {notAdded.length > 0 && (
          <div className="border-seam flex flex-col gap-2 border-2 p-3">
            <h4 className="font-display text-label text-thread">{t.notAddedTitle}</h4>
            <p className="text-body-small text-ink-soft">{t.notAddedBody}</p>
            <ul className="flex flex-col gap-2">
              {notAdded.map((line, i) => (
                <li key={`${i}:${line.raw}`} className="text-body-small flex flex-col gap-1">
                  <span>{line.raw}</span>
                  {line.suggestions.length > 0 && (
                    <span className="flex flex-col gap-1">
                      <span className="text-ink-soft">{t.suggestions}</span>
                      {line.suggestions.map((suggestion) => {
                        const suggestedName = foodName(suggestion.draft.databaseFood, locale);
                        return (
                          <Button
                            key={suggestion.draft.databaseFood.sourceRef}
                            variant="secondary"
                            fullWidth
                            disabled={rows.length >= MAX_INGREDIENTS}
                            aria-label={fill(t.useSuggestionFor, {
                              name: suggestedName,
                              line: line.raw,
                            })}
                            onClick={() => pickSuggestion(i, suggestion)}
                          >
                            {suggestedName}
                          </Button>
                        );
                      })}
                    </span>
                  )}
                </li>
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
              variant="secondary"
              fullWidth
              disabled={!weightValid || ingredients.length >= MAX_INGREDIENTS}
              onClick={add}
            >
              {t.add}
            </Button>
          </>
        )}
        {ingredients.length >= MAX_INGREDIENTS && (
          <p className="text-body-small text-ink-soft">{tooManyText(all)}</p>
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
      <p className="text-body-small text-ink-soft">{t.cookedHint}</p>

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
            <p className="text-ink-soft">
              {fill(t.partial, {
                counted: summary.ingredientsCounted,
                total: summary.ingredientsTotal,
              })}
            </p>
          )}
        </div>
      )}

      {/* Always mounted: a live region is announced reliably only when its text changes. */}
      <p role="status" className="text-body-small text-ink-soft empty:hidden">
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
