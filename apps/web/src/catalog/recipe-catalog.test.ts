import {
  databaseFood,
  notFound,
  rankedMatches,
  savedFailed,
  savedOk,
  type CatalogResult,
  type FoodCatalog,
  type FoodEntryDraft,
  type Recipe,
  type SavedResult,
} from '@anc/core';
import { describe, expect, it } from 'vitest';
import { RecipeFoodCatalog, recipePresets } from './recipe-catalog';

const food = (ref: string, name: string, source: 'seed' | 'ciqual') =>
  databaseFood({ sourceRef: ref, displayName: name, source, foodGroup: 'protein' });
const match = (ref: string, name: string, source: 'seed' | 'ciqual') => ({
  food: food(ref, name, source),
  confidence: 0.6,
  presets: [],
});

/** The seeds first, then the table, as the real catalog answers. */
const base: FoodCatalog = {
  search: (query) =>
    Promise.resolve<CatalogResult>(
      query.includes('chicken')
        ? rankedMatches([
            match('seed:chicken', 'Chicken breast', 'seed'),
            match('seed:chicken-soup', 'Chicken soup', 'seed'),
            match('ciqual:36000', 'Chicken, roasted', 'ciqual'),
          ])
        : notFound(query),
    ),
  lookupBySourceRef: (ref) =>
    Promise.resolve(ref === 'seed:chicken' ? food(ref, 'Chicken', 'seed') : null),
  lookupByBarcode: () => Promise.resolve(notFound('')),
};

const ingredient = (grams: number): FoodEntryDraft => ({
  databaseFood: databaseFood({
    sourceRef: 'seed:rice',
    displayName: 'Rice',
    source: 'seed',
    nutrientsPer100g: { energyKcal: 130, protein: 2.7 },
  }),
  quantity: { low: grams, high: grams, unit: 'g', displayLabel: `${grams} g`, grams },
});

const recipe = (id: number, name: string): Recipe => ({
  id,
  name,
  createdAtUtc: 0,
  servings: 4,
  cookedWeightGrams: 800,
  ingredients: [ingredient(200), ingredient(300)],
});

function store(recipes: readonly Recipe[]) {
  let reads = 0;
  let fail = false;
  return {
    api: {
      listRecipes: (): Promise<SavedResult<readonly Recipe[]>> => {
        reads++;
        return Promise.resolve(fail ? savedFailed('locked') : savedOk(recipes));
      },
    },
    get reads() {
      return reads;
    },
    failNext: () => {
      fail = true;
    },
    recover: () => {
      fail = false;
    },
  };
}

const names = (result: CatalogResult): string[] =>
  result.kind === 'rankedMatches' ? result.matches.map((m) => m.food.displayName) : [];

describe('RecipeFoodCatalog', () => {
  it('lists a matching recipe after the seeds and before the CIQUAL table', async () => {
    const catalog = new RecipeFoodCatalog(
      base,
      store([recipe(7, 'Chicken and rice')]).api,
      () => 'en',
    );
    const result = await catalog.search('chicken');
    expect(names(result)).toEqual([
      'Chicken breast',
      'Chicken soup',
      'Chicken and rice',
      'Chicken, roasted',
    ]);
    const mine = result.kind === 'rankedMatches' ? result.matches[2] : undefined;
    expect(mine?.food.source).toBe('recipe');
    expect(mine?.food.sourceRef).toBe('recipe:7');
    // One serving (per-serving grams from the cooked weight) and 100 g.
    expect(mine?.presets.map((p) => [p.unit, p.grams])).toEqual([
      ['serving', 200],
      ['g', 100],
    ]);
  });

  it('a recipe is found when nothing else matches, ignoring case and accents', async () => {
    const catalog = new RecipeFoodCatalog(
      base,
      store([recipe(1, 'Gratin dauphinois')]).api,
      () => 'en',
    );
    expect(names(await catalog.search('DAUPHINOIS'))).toEqual(['Gratin dauphinois']);
    expect(names(await catalog.search('gratin dauph'))).toEqual(['Gratin dauphinois']);
    expect((await catalog.search('soup')).kind).toBe('notFound');
  });

  it('leaves the answer alone when no recipe matches, and respects the limit', async () => {
    const catalog = new RecipeFoodCatalog(
      base,
      store([recipe(7, 'Chicken and rice')]).api,
      () => 'en',
    );
    expect(names(await catalog.search('chicken', { limit: 3 }))).toEqual([
      'Chicken breast',
      'Chicken soup',
      'Chicken and rice',
    ]);
    const plain = new RecipeFoodCatalog(base, store([recipe(7, 'Lentil stew')]).api, () => 'en');
    expect(names(await plain.search('chicken'))).toEqual([
      'Chicken breast',
      'Chicken soup',
      'Chicken, roasted',
    ]);
  });

  it('reads the recipes once until they change, and again after invalidate()', async () => {
    const s = store([recipe(7, 'Chicken and rice')]);
    const catalog = new RecipeFoodCatalog(base, s.api, () => 'en');
    await catalog.search('chicken');
    await catalog.search('chicken rice');
    expect(s.reads).toBe(1);
    catalog.invalidate();
    await catalog.search('chicken');
    expect(s.reads).toBe(2);
  });

  it('a store that cannot answer adds nothing and is asked again next time', async () => {
    const s = store([recipe(7, 'Chicken and rice')]);
    s.failNext();
    const catalog = new RecipeFoodCatalog(base, s.api, () => 'en');
    expect(names(await catalog.search('chicken'))).toEqual([
      'Chicken breast',
      'Chicken soup',
      'Chicken, roasted',
    ]);
    s.recover();
    expect(names(await catalog.search('chicken'))).toContain('Chicken and rice');
  });

  it('resolves recipe: references itself and everything else through the wrapped catalog', async () => {
    const catalog = new RecipeFoodCatalog(
      base,
      store([recipe(7, 'Chicken and rice')]).api,
      () => 'en',
    );
    expect((await catalog.lookupBySourceRef('recipe:7'))?.displayName).toBe('Chicken and rice');
    expect(await catalog.lookupBySourceRef('recipe:8')).toBeNull();
    expect((await catalog.lookupBySourceRef('seed:chicken'))?.displayName).toBe('Chicken');
    expect((await catalog.lookupByBarcode('1')).kind).toBe('notFound');
  });
});

describe('recipePresets', () => {
  it('flags the serving as an estimate without a cooked weight', () => {
    const { cookedWeightGrams: _unused, ...rest } = recipe(1, 'x');
    void _unused;
    const [serving] = recipePresets({ ...rest }, 'en');
    expect(serving?.grams).toBe(125);
    expect(serving?.gramsEstimated).toBe(true);
    expect(recipePresets(recipe(1, 'x'), 'en')[0]?.gramsEstimated).toBe(false);
  });

  it('words the serving in the language', () => {
    expect(recipePresets(recipe(1, 'x'), 'fr')[0]?.displayLabel).toBe('~1 portion');
  });
});
