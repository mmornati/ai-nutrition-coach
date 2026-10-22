/**
 * Home recipes in the food search. `RecipeFoodCatalog` wraps another catalog and adds the person's
 * recipes to its search: a recipe whose name matches is listed after the curated seed foods and
 * before everything else (CIQUAL), with its own presets (one serving, 100 g). A recipe's food is
 * `source: 'recipe'` and the reference `recipe:<id>`, so a logged plate keeps its own snapshot.
 *
 * The recipes are read once from the store and remembered until a recipe is saved or deleted
 * (`invalidate`). A store that cannot answer (locked) simply adds nothing: the wrapped catalog's
 * answer stands. Nothing here touches the network.
 */
import {
  gramsQuantity,
  rankedMatches,
  recipeAsFood,
  computeRecipe,
  type CatalogResult,
  type DatabaseFood,
  type FoodCatalog,
  type FoodMatch,
  type QuantityRange,
  type Recipe,
  type SavedStore,
} from '@anc/core';
import { currentLocale } from '../i18n';
import { catalogueFor } from '../i18n/catalogues';
import type { Locale } from '../i18n/locale';
import { foldText } from './fold';
import { quantityLabel } from './food-display';

const DEFAULT_LIMIT = 10;

/** One serving (the recipe's per-serving weight) and 100 g, in the language's words. */
export function recipePresets(
  recipe: Recipe,
  locale: Locale = currentLocale(),
): readonly QuantityRange[] {
  const n = computeRecipe(recipe);
  const serving = { low: 1, high: 1, unit: 'serving', displayLabel: '' };
  const per100Label = catalogueFor(locale).foods.portions['per100'] ?? '100 g';
  return [
    {
      ...serving,
      displayLabel: quantityLabel(serving, locale),
      grams: n.perServingGrams,
      // Cooked weight divided by servings is an assumption (a serving is rarely exactly even).
      gramsEstimated: true,
    },
    gramsQuantity(100, { estimated: false, displayLabel: per100Label }),
  ];
}

/** Every query word is part of the name (accents and case ignored). */
function matches(query: string, name: string): boolean {
  const folded = foldText(name);
  return query
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .every((t) => folded.includes(t));
}

export class RecipeFoodCatalog implements FoodCatalog {
  private cache: readonly Recipe[] | null = null;
  private loading: Promise<readonly Recipe[]> | null = null;

  constructor(
    private readonly base: FoodCatalog,
    private readonly saved: Pick<SavedStore, 'listRecipes'>,
    private readonly locale: () => Locale = currentLocale,
  ) {}

  /** The wrapped catalog's remembered searches and barcodes (0 when it keeps none). */
  get cachedQueries(): number {
    return (this.base as { cachedQueries?: number }).cachedQueries ?? 0;
  }
  get cachedBarcodes(): number {
    return (this.base as { cachedBarcodes?: number }).cachedBarcodes ?? 0;
  }

  /** The recipes changed: read them again on the next search. */
  invalidate(): void {
    this.cache = null;
    this.loading = null;
  }

  private async recipes(): Promise<readonly Recipe[]> {
    if (this.cache !== null) return this.cache;
    if (this.loading === null) {
      const attempt: Promise<readonly Recipe[]> = this.saved
        .listRecipes()
        .then((result): readonly Recipe[] => {
          if (result.kind !== 'saved') return [];
          // Only a successful read is remembered (and only if nothing invalidated it meanwhile).
          if (this.loading === attempt) this.cache = result.value;
          return result.value;
        })
        .catch((): readonly Recipe[] => [])
        .finally(() => {
          // A failed read is asked again next time.
          if (this.loading === attempt) this.loading = null;
        });
      this.loading = attempt;
    }
    return this.loading;
  }

  async search(query: string, options?: { readonly limit?: number }): Promise<CatalogResult> {
    const limit = options?.limit ?? DEFAULT_LIMIT;
    const [result, recipes] = await Promise.all([this.base.search(query, options), this.recipes()]);
    const needle = foldText(query.trim().toLowerCase());
    if (needle === '' || recipes.length === 0) return result;
    const locale = this.locale();
    const found: FoodMatch[] = recipes
      .filter((r) => matches(needle, r.name))
      .map((r) => ({ food: recipeAsFood(r), confidence: 0.5, presets: recipePresets(r, locale) }));
    if (found.length === 0) return result;
    const base = result.kind === 'rankedMatches' ? result.matches : [];
    // Seeds first, then the recipes, then the rest. Room for the recipes is reserved before the
    // limit cuts anything, so a name match is never pushed out by a long list of seeds.
    let at = 0;
    base.forEach((m, i) => {
      if (m.food.source === 'seed') at = i + 1;
    });
    const room = Math.max(0, limit);
    const mine = found.slice(0, room);
    const seeds = base.slice(0, at).slice(0, Math.max(0, room - mine.length));
    const merged = [...seeds, ...mine, ...base.slice(at)].slice(0, room);
    return rankedMatches(merged);
  }

  async lookupBySourceRef(sourceRef: string): Promise<DatabaseFood | null> {
    if (sourceRef.startsWith('recipe:')) {
      const found = (await this.recipes()).find((r) => `recipe:${r.id}` === sourceRef);
      return found === undefined ? null : recipeAsFood(found);
    }
    return this.base.lookupBySourceRef(sourceRef);
  }

  lookupByBarcode(code: string): Promise<CatalogResult> {
    return this.base.lookupByBarcode(code);
  }
}
