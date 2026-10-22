// "Paste a recipe", read on the device: the ingredients section, the amounts and units (English and
// French, fractions, "2 x 400 g"), the grams that are exact and the ones that are estimates,
// servings, accents, and what is left "not added". Offline, nothing sent.
import { databaseFood, type CatalogResult, type FoodCatalog, type FoodMatch } from '@anc/core';
import { describe, expect, it } from 'vitest';
import { foldText } from '../catalog/fold';
import {
  gramsOfLine,
  isLiquid,
  numberOf,
  parseIngredientLine,
  parseRecipeText,
  prefillFromAi,
  recipeFromText,
  servingsOf,
} from './recipe-paste';

const food = (ref: string, name: string) =>
  databaseFood({
    sourceRef: ref,
    displayName: name,
    source: 'seed',
    nutrientsPer100g: { energyKcal: 100 },
  });

/** A catalogue that knows a few foods, found when the query contains their key. */
function catalogOf(known: Readonly<Record<string, string>>): FoodCatalog {
  return {
    async search(query): Promise<CatalogResult> {
      const q = foldText(query);
      const hit = Object.entries(known).find(([key]) => q.includes(key));
      if (hit === undefined) return { kind: 'rankedMatches', matches: [] };
      const match: FoodMatch = {
        food: food(`seed:${hit[0]}`, hit[1]),
        confidence: 0.9,
        presets: [],
      };
      return { kind: 'rankedMatches', matches: [match] };
    },
    async lookupBySourceRef() {
      return null;
    },
    async lookupByBarcode(): Promise<CatalogResult> {
      return { kind: 'rankedMatches', matches: [] };
    },
  };
}

// Names in the language of the key, as the real catalogue words them (the matcher reads the words).
const CATALOG = catalogOf({
  farine: 'Farine de blé',
  flour: 'Wheat flour',
  lait: 'Lait',
  milk: 'Milk',
  oeuf: 'Oeuf cru',
  egg: 'Egg, raw',
  sucre: 'Sucre blanc',
  sugar: 'Sugar, white',
  oil: 'Olive oil',
  huile: 'Huile d’olive',
  tomat: 'Tomate',
  salt: 'Salt',
  sel: 'Sel',
  honey: 'Honey',
  rice: 'Rice, white, raw',
});

describe('numberOf', () => {
  it('reads whole, decimal (comma or dot), simple and mixed fractions and fraction glyphs', () => {
    expect(numberOf('2')).toBe(2);
    expect(numberOf('2,5')).toBe(2.5);
    expect(numberOf('2.5')).toBe(2.5);
    expect(numberOf('1/2')).toBe(0.5);
    expect(numberOf('1 1/2')).toBe(1.5);
    expect(numberOf('½')).toBe(0.5);
    expect(numberOf('1½')).toBe(1.5);
    expect(numberOf('¾')).toBe(0.75);
    expect(numberOf('1/0')).toBeNull();
    expect(numberOf('abc')).toBeNull();
  });
});

describe('parseIngredientLine: amounts and units', () => {
  it('reads weights as exact grams', () => {
    expect(parseIngredientLine('200 g flour')).toMatchObject({ term: 'flour', exactGrams: 200 });
    expect(parseIngredientLine('1,5 kg de pommes de terre')).toMatchObject({
      term: 'pommes de terre',
      exactGrams: 1500,
    });
    expect(parseIngredientLine('200g de farine')).toMatchObject({
      term: 'farine',
      exactGrams: 200,
    });
    expect(parseIngredientLine('4 oz butter')).toMatchObject({ term: 'butter' });
    expect(parseIngredientLine('4 oz butter')?.exactGrams).toBeCloseTo(113.4, 1);
  });

  it('reads "2 x 400 g" as 800 g', () => {
    expect(parseIngredientLine('2 x 400 g tomatoes')).toMatchObject({
      term: 'tomatoes',
      exactGrams: 800,
    });
    expect(parseIngredientLine('2 × 400 g de tomates pelées')).toMatchObject({ exactGrams: 800 });
  });

  it('reads fractions and glyphs', () => {
    expect(parseIngredientLine('1/2 cup milk')?.amount).toEqual({ value: 0.5, unit: 'cup' });
    expect(parseIngredientLine('1 1/2 tsp salt')?.amount).toEqual({ value: 1.5, unit: 'tsp' });
    expect(parseIngredientLine('½ tasse de lait')?.amount).toEqual({ value: 0.5, unit: 'cup' });
    expect(parseIngredientLine('¼ l de lait')?.amount).toEqual({ value: 250, unit: 'ml' });
  });

  it('reads the French spoon spellings and keeps the name after "de" / "d’"', () => {
    expect(parseIngredientLine('2 c. à soupe d’huile d’olive')).toMatchObject({
      term: 'huile d’olive',
      amount: { value: 2, unit: 'tbsp' },
    });
    expect(parseIngredientLine('1 cuillère à café de sel')).toMatchObject({
      term: 'sel',
      amount: { value: 1, unit: 'tsp' },
    });
    expect(parseIngredientLine('3 càs de sucre')?.amount).toEqual({ value: 3, unit: 'tbsp' });
    expect(parseIngredientLine('1 càc de sel')?.amount).toEqual({ value: 1, unit: 'tsp' });
    expect(parseIngredientLine('1 pincée de sel')).toMatchObject({
      term: 'sel',
      amount: { value: 1, unit: 'pinch' },
    });
    expect(parseIngredientLine('1 tablespoon honey')?.amount).toEqual({ value: 1, unit: 'tbsp' });
    expect(parseIngredientLine('2 tsp honey')?.amount).toEqual({ value: 2, unit: 'tsp' });
    expect(parseIngredientLine('1 pinch of salt')?.amount).toEqual({ value: 1, unit: 'pinch' });
  });

  it('takes the middle of a range', () => {
    expect(parseIngredientLine('2-3 tbsp oil')?.amount).toEqual({ value: 2.5, unit: 'tbsp' });
  });

  it('drops bullets, tick boxes, brackets, preparation after a comma', () => {
    expect(parseIngredientLine('• 3 tomatoes, chopped (ripe)')).toMatchObject({ term: 'tomatoes' });
    expect(parseIngredientLine('- 100 g sugar')).toMatchObject({ term: 'sugar', exactGrams: 100 });
    expect(parseIngredientLine('☐ 1 cup rice')).toMatchObject({ term: 'rice' });
  });

  it('has Unicode-safe word ends: "2 gâteaux" and "3 gousses d’ail" are not grams', () => {
    const cakes = parseIngredientLine('2 gâteaux secs');
    expect(cakes?.exactGrams).toBeUndefined();
    expect(cakes?.term).toBe('gâteaux secs');
    expect(parseIngredientLine('3 gousses d’ail')?.exactGrams).toBeUndefined();
    // A unit followed by an accented letter is a word, not that unit.
    expect(parseIngredientLine('4 cécile')?.amount).toBeUndefined();
    // "oeufs" keeps its name and no weight.
    expect(parseIngredientLine('3 œufs')).toEqual({ raw: '3 œufs', term: 'œufs', count: 3 });
  });

  it('gives nothing for an empty or very long line', () => {
    expect(parseIngredientLine('   ')).toBeNull();
    expect(parseIngredientLine('x'.repeat(200))).toBeNull();
    expect(parseIngredientLine('200 g')).toBeNull();
  });
});

describe('gramsOfLine: exact and estimated', () => {
  const line = (text: string) =>
    parseIngredientLine(text) as NonNullable<ReturnType<typeof parseIngredientLine>>;

  it('a weight is exact', () => {
    expect(gramsOfLine(line('250 g flour'))).toEqual({ grams: 250, estimated: false });
    expect(gramsOfLine(line('1,5 kg flour'))).toEqual({ grams: 1500, estimated: false });
  });

  it('spoons and a pinch are estimates, for any ingredient: 15 g, 5 g, 0.5 g', () => {
    expect(gramsOfLine(line('2 tbsp honey'))).toEqual({ grams: 30, estimated: true });
    expect(gramsOfLine(line('1 tsp salt'))).toEqual({ grams: 5, estimated: true });
    expect(gramsOfLine(line('2 c. à soupe de farine'))).toEqual({ grams: 30, estimated: true });
    expect(gramsOfLine(line('1 pinch of salt'))).toEqual({ grams: 0.5, estimated: true });
  });

  it('a volume is grams only for a liquid (oil at 0.92), a cup is 240 ml', () => {
    expect(gramsOfLine(line('250 ml milk'))).toEqual({ grams: 250, estimated: true });
    expect(gramsOfLine(line('25 cl de lait'))).toEqual({ grams: 250, estimated: true });
    expect(gramsOfLine(line('1 cup of milk'))).toEqual({ grams: 240, estimated: true });
    expect(gramsOfLine(line('100 ml olive oil'))).toEqual({ grams: 92, estimated: true });
    // A solid by volume, and a bare count, have no weight: the person picks one.
    expect(gramsOfLine(line('1 cup flour'))).toBeUndefined();
    expect(gramsOfLine(line('200 ml tomatoes'))).toBeUndefined();
    expect(gramsOfLine(line('3 eggs'))).toBeUndefined();
  });

  it('knows liquids by name, in both languages and with accents', () => {
    for (const name of [
      'water',
      'eau',
      'crème fraîche',
      'bière',
      'vinaigre',
      'bouillon de légumes',
    ]) {
      expect(isLiquid(name)).toBe(true);
    }
    for (const name of ['flour', 'farine', 'tomatoes', 'oats']) expect(isLiquid(name)).toBe(false);
  });
});

describe('servingsOf', () => {
  it('reads the English and French ways of saying it', () => {
    expect(servingsOf('Serves 4')).toBe(4);
    expect(servingsOf('Servings: 6')).toBe(6);
    expect(servingsOf('makes 12 servings')).toBe(12);
    expect(servingsOf('4 servings')).toBe(4);
    expect(servingsOf('Pour 4 personnes')).toBe(4);
    expect(servingsOf('pour 6 pers.')).toBe(6);
    expect(servingsOf('Pour : 8 parts')).toBe(8);
    expect(servingsOf('3 portions')).toBe(3);
    expect(servingsOf('Rendement : 6 parts')).toBe(6);
  });

  it('refuses nothing sensible and nothing out of range', () => {
    expect(servingsOf('no number here')).toBeUndefined();
    expect(servingsOf('Serves 0')).toBeUndefined();
    expect(servingsOf('Serves 250')).toBeUndefined();
  });
});

describe('parseRecipeText', () => {
  it('reads an English page: a name, servings, the ingredients, and stops at the method', () => {
    const parsed = parseRecipeText(
      [
        'Pancakes',
        'Serves 4',
        'Ingredients',
        '200 g flour',
        '2 eggs',
        '1/2 cup milk',
        '',
        '1 tbsp sugar',
        'Method',
        '1. Mix the flour and the eggs. Stir well. Cook for 10 minutes.',
      ].join('\n'),
    );
    expect(parsed.name).toBe('Pancakes');
    expect(parsed.servings).toBe(4);
    expect(parsed.lines.map((l) => l.term)).toEqual(['flour', 'eggs', 'milk', 'sugar']);
  });

  it('reads a French page with accents and the heading with a colon', () => {
    const parsed = parseRecipeText(
      [
        'Crêpes légères',
        'Pour 6 personnes',
        'Ingrédients :',
        '250 g de farine',
        '3 œufs',
        '50 cl de lait',
        '1 pincée de sel',
        'Préparation',
        'Mélangez la farine et les œufs.',
      ].join('\n'),
    );
    expect(parsed.name).toBe('Crêpes légères');
    expect(parsed.servings).toBe(6);
    expect(parsed.lines.map((l) => l.term)).toEqual(['farine', 'œufs', 'lait', 'sel']);
  });

  it('takes a bare pasted list when there is no heading, skipping the servings line and long sentences', () => {
    const parsed = parseRecipeText(
      ['Serves 2', '100 g rice', '1 tsp salt', 'Cook everything together. '.repeat(6)].join('\n'),
    );
    expect(parsed.name).toBeUndefined();
    expect(parsed.servings).toBe(2);
    expect(parsed.lines.map((l) => l.term)).toEqual(['rice', 'salt']);
  });

  it('takes the first ingredient from the heading line itself', () => {
    const parsed = parseRecipeText('Ingredients: 100 g rice\n1 tsp salt');
    expect(parsed.lines.map((l) => l.term)).toEqual(['rice', 'salt']);
  });

  it('cuts the text at 8,000 characters and ignores control characters', () => {
    const parsed = parseRecipeText(`Ingredients\n100 g rice\u0007\n${'x\n'.repeat(9000)}`);
    expect(parsed.lines[0]).toMatchObject({ term: 'rice', exactGrams: 100 });
    expect(parsed.lines.length).toBeLessThanOrEqual(50);
  });
});

describe('recipeFromText: against the catalogue', () => {
  const FRENCH = [
    'Crêpes',
    'Pour 4 personnes',
    'Ingrédients',
    '250 g de farine',
    '2 c. à soupe de sucre',
    '50 cl de lait',
    '3 œufs',
    '1 pincée de safran',
    'Préparation',
  ].join('\n');

  it('prefills name, servings and weighed ingredients; marks conversions; lists what is left', async () => {
    const prefill = await recipeFromText(FRENCH, CATALOG);
    expect(prefill.name).toBe('Crêpes');
    expect(prefill.servings).toBe(4);
    expect(
      prefill.ingredients.map((i) => [
        i.draft.databaseFood.displayName,
        i.draft.quantity.grams,
        i.draft.quantity.gramsEstimated,
      ]),
    ).toEqual([
      ['Farine de blé', 250, false],
      ['Sucre blanc', 30, true],
      ['Lait', 500, true],
      // A bare count: 3 pieces of 55 g, an estimate.
      ['Oeuf cru', 165, true],
    ]);
    // Saffron matches nothing.
    expect(prefill.notAdded).toEqual([{ raw: '1 pincée de safran', suggestions: [] }]);
    expect(prefill.anyEstimated).toBe(true);
  });

  it('is not estimated when every weight was written in grams', async () => {
    const prefill = await recipeFromText('Ingredients\n200 g flour\n100 g sugar', CATALOG);
    expect(prefill.anyEstimated).toBe(false);
    expect(prefill.notAdded).toEqual([]);
  });

  it('survives a catalogue that throws', async () => {
    const broken: FoodCatalog = {
      ...CATALOG,
      search: () => Promise.reject(new Error('boom')),
    };
    const prefill = await recipeFromText('Ingredients\n200 g flour', broken);
    expect(prefill.ingredients).toEqual([]);
    expect(prefill.notAdded).toEqual([{ raw: '200 g flour', suggestions: [] }]);
  });

  it('keeps at most 40 ingredients', async () => {
    const text = `Ingredients\n${Array.from({ length: 45 }, () => '10 g flour').join('\n')}`;
    const prefill = await recipeFromText(text, CATALOG);
    expect(prefill.ingredients).toHaveLength(40);
  });
});

describe('prefillFromAi: names and weights from the AI, nutrients from the catalogue only', () => {
  it('matches names, keeps the AI weights with their estimated flag, lists the unmatched with weight', async () => {
    const prefill = await prefillFromAi(
      {
        name: 'Pancakes',
        servings: 4,
        ingredients: [
          { name: 'flour', grams: 200, estimated: false },
          { name: 'milk', grams: 240, estimated: true },
          { name: 'dragon fruit', grams: 50, estimated: true },
        ],
      },
      CATALOG,
    );
    expect(prefill.name).toBe('Pancakes');
    expect(prefill.servings).toBe(4);
    expect(
      prefill.ingredients.map((i) => [
        i.draft.databaseFood.source,
        i.draft.quantity.gramsEstimated,
      ]),
    ).toEqual([
      ['seed', false],
      ['seed', true],
    ]);
    expect(prefill.notAdded).toEqual([{ raw: 'dragon fruit (≈50 g)', suggestions: [] }]);
    expect(prefill.anyEstimated).toBe(true);
  });
});
