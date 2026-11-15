// The no-AI way to describe a meal: split on commas and "and" / "et", drop the amount, look each
// piece up in the on-device catalogue. Offline, nothing sent.
import { type DatabaseFood, type FoodCatalog, type FoodMatch, type QuantityRange } from '@anc/core';
import { describe, expect, it } from 'vitest';
import { describeLocally, leadingCount, searchTermOf, splitDescription } from './describe-local';

const foodMatch = (m: FoodMatch): FoodMatch => m;

describe('splitDescription', () => {
  it('splits on commas, semicolons, new lines and the words and / et (and & + plus puis then)', () => {
    expect(splitDescription('two eggs, toast with butter, a coffee with milk')).toEqual([
      'two eggs',
      'toast with butter',
      'a coffee with milk',
    ]);
    expect(splitDescription('rice and beans; an apple\nyogurt')).toEqual([
      'rice',
      'beans',
      'an apple',
      'yogurt',
    ]);
    expect(splitDescription('du pain et du beurre, une pomme et un café')).toEqual([
      'du pain',
      'du beurre',
      'une pomme',
      'un café',
    ]);
    expect(splitDescription('tea + toast + jam plus honey puis cake then soup')).toEqual([
      'tea',
      'toast',
      'jam',
      'honey',
      'cake',
      'soup',
    ]);
  });

  it('does not split inside a word ("sand", "etc") and drops empty pieces', () => {
    expect(splitDescription('sandwich, , etc, bread,')).toEqual(['sandwich', 'etc', 'bread']);
  });

  it('keeps at most 10 pieces, each at most 60 characters', () => {
    expect(
      splitDescription(Array.from({ length: 15 }, (_, i) => `food${i}`).join(', ')),
    ).toHaveLength(10);
    expect(Array.from(splitDescription('z'.repeat(200))[0] ?? '')).toHaveLength(60);
  });
});

describe('accents and "&"', () => {
  it('does not treat the start of an accented word as a unit or amount', () => {
    expect(searchTermOf('2 gâteaux')).toBe('gâteaux');
    expect(searchTermOf('1 gésier')).toBe('gésier');
    expect(searchTermOf('3 légumes')).toBe('légumes');
    expect(searchTermOf('1 l’orange')).toBe('orange');
    expect(searchTermOf('un œuf')).toBe('œuf');
    expect(searchTermOf('2 grapefruits')).toBe('grapefruits');
    expect(searchTermOf('apple')).toBe('apple');
    expect(searchTermOf('une glace')).toBe('glace');
  });

  it('keeps "mac & cheese" and "fish & chips" whole', () => {
    expect(splitDescription('mac & cheese, fish & chips')).toEqual([
      'mac & cheese',
      'fish & chips',
    ]);
  });
});

describe('searchTermOf', () => {
  it('drops a leading amount, in English and French', () => {
    expect(searchTermOf('2 eggs')).toBe('eggs');
    expect(searchTermOf('two eggs')).toBe('eggs');
    expect(searchTermOf('a coffee with milk')).toBe('coffee with milk');
    expect(searchTermOf('150 g of rice')).toBe('rice');
    expect(searchTermOf('a cup of tea')).toBe('tea');
    expect(searchTermOf('deux œufs')).toBe('œufs');
    expect(searchTermOf('du pain')).toBe('pain');
    expect(searchTermOf('une tasse de café')).toBe('café');
    expect(searchTermOf('200ml milk')).toBe('milk');
  });

  it('drops "2x", a dozen and a range too', () => {
    expect(searchTermOf('2x eggs')).toBe('eggs');
    expect(searchTermOf('2 x eggs')).toBe('eggs');
    expect(searchTermOf('a dozen eggs')).toBe('eggs');
    expect(searchTermOf('une douzaine d’œufs')).toBe('œufs');
    expect(searchTermOf('3-4 eggs')).toBe('eggs');
    expect(searchTermOf('3 to 4 eggs')).toBe('eggs');
  });

  it('keeps the piece when nothing is left', () => {
    expect(searchTermOf('two')).toBe('two');
    expect(searchTermOf('apple')).toBe('apple');
  });
});

const food = (
  ref: string,
  name: string,
  group: DatabaseFood['foodGroup'] = 'other',
): DatabaseFood => ({
  sourceRef: ref,
  displayName: name,
  source: 'seed',
  foodGroup: group,
});
const portion = (label: string, grams: number): QuantityRange => ({
  low: 1,
  high: 1,
  unit: label,
  displayLabel: label,
  grams,
  gramsEstimated: true,
});

/** A catalogue that answers from a table keyed by the lower-case query. */
function catalogOf(
  table: Record<string, readonly FoodMatch[]>,
): FoodCatalog & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    search: async (query: string) => {
      queries.push(query);
      const matches = table[query.toLowerCase()] ?? [];
      return matches.length === 0
        ? { kind: 'notFound' as const }
        : { kind: 'rankedMatches' as const, matches };
    },
  } as unknown as FoodCatalog & { queries: string[] };
}

describe('describeLocally', () => {
  const egg = food('egg', 'Egg', 'protein');
  const toast = food('toast', 'Toast', 'starch');
  const coffee = food('coffee', 'Coffee');
  const table = {
    eggs: [
      foodMatch({ food: egg, confidence: 0.9, presets: [portion('1 egg', 50)] }),
      foodMatch({
        food: food('egg-w', 'Egg white'),
        confidence: 0.5,
        presets: [portion('1 white', 30)],
      }),
    ],
    'toast with butter': [
      foodMatch({ food: toast, confidence: 0.7, presets: [portion('1 slice', 30)] }),
    ],
    'coffee with milk': [
      foodMatch({ food: coffee, confidence: 0.8, presets: [portion('1 cup', 150)] }),
    ],
  };

  it('looks each piece up and offers the best match of each, ticked, with the others as closest', async () => {
    const catalog = catalogOf(table);
    const out = await describeLocally('two eggs, toast with butter, a coffee with milk', catalog);
    if (out.result.kind !== 'recognizedPlate') throw new Error('not a plate');
    expect(out.result.foods.map((f) => f.databaseFood.displayName)).toEqual([
      'Egg',
      'Toast',
      'Coffee',
    ]);
    expect(out.result.foods[0]?.quantity.displayLabel).toBe('2 × 1 egg');
    expect(out.unmatched).toEqual([]);
    expect(out.closestMatches.map((m) => m.food.displayName)).toEqual([
      'Egg',
      'Egg white',
      'Toast',
      'Coffee',
    ]);
    // The amount was dropped for the first search; nothing but the catalogue was asked.
    expect(catalog.queries[0]).toBe('eggs');
  });

  it('falls back to the whole piece when the trimmed one finds nothing, and lists what matched nothing', async () => {
    const catalog = catalogOf({
      'two sausages': [
        foodMatch({ food: food('s', 'Sausage'), confidence: 0.6, presets: [portion('1', 60)] }),
      ],
    });
    const out = await describeLocally('two sausages, zzz', catalog);
    if (out.result.kind !== 'recognizedPlate') throw new Error('not a plate');
    expect(out.result.foods.map((f) => f.databaseFood.displayName)).toEqual(['Sausage']);
    expect(out.unmatched).toEqual(['zzz']);
    expect(catalog.queries).toContain('sausages');
    expect(catalog.queries).toContain('two sausages');
  });

  it('keeps a weight typed in grams as the portion', async () => {
    const catalog = catalogOf({
      rice: [
        foodMatch({
          food: food('rice', 'Rice', 'starch'),
          confidence: 0.9,
          presets: [portion('1 bowl', 180)],
        }),
      ],
      '150 g rice': [],
    });
    const out = await describeLocally('150 g rice', catalog);
    if (out.result.kind !== 'recognizedPlate') throw new Error('not a plate');
    expect(out.result.foods[0]?.quantity).toMatchObject({ grams: 150, unit: 'g' });
    expect(out.result.foods[0]?.quantity.gramsEstimated).toBeUndefined();
  });

  it('lists a food two pieces both match once, and survives a failing catalogue', async () => {
    const twice = await describeLocally('eggs, eggs', catalogOf(table));
    if (twice.result.kind !== 'recognizedPlate') throw new Error('not a plate');
    // The same food is never listed twice: the second "eggs" gets the next best match.
    expect(twice.result.foods.map((f) => f.databaseFood.displayName)).toEqual(['Egg', 'Egg white']);
    const broken = {
      search: () => Promise.reject(new Error('index not loaded')),
    } as unknown as FoodCatalog;
    const out = await describeLocally('eggs, toast', broken);
    if (out.result.kind !== 'recognizedPlate') throw new Error('not a plate');
    expect(out.result.foods).toEqual([]);
    expect(out.unmatched).toEqual(['eggs', 'toast']);
  });
});

describe('leadingCount', () => {
  it.each([
    ['3 eggs', 3],
    ['3 œufs', 3],
    ['2 tranches de pain', 2],
    ['2 slices of bread', 2],
    ['2tbsp sugar', 2],
    ['a banana', 1],
    ['une pomme', 1],
    ['deux yaourts', 2],
    ['twelve grapes', 12],
    ['douze huîtres', 12],
    ['1,5 portions rice', 1.5],
    ['1.5 servings rice', 1.5],
    ['½ avocado', 0.5],
    ['1/2 avocado', 0.5],
    ['half an avocado', 0.5],
    ['demi avocat', 0.5],
    ['2x eggs', 2],
    ['2 x eggs', 2],
    ['2 × œufs', 2],
    ['a dozen eggs', 12],
    ['une douzaine d’œufs', 12],
    ['dozen eggs', 12],
    ['3-4 eggs', 3],
    ['3 – 4 œufs', 3],
    ['3 to 4 eggs', 3],
    ['2-3 slices of bread', 2],
  ])('%s is %d', (piece, n) => {
    expect(leadingCount(piece)).toBe(n);
  });

  it('does not scale when the number belongs to the name of the food', () => {
    for (const piece of [
      '4 seasons pizza',
      '4 saisons',
      '5 cereal bread',
      '7 grain bread',
      '4 épices',
      '4 fromages',
      '3 cheeses',
      '5 céréales',
      'quatre-quarts',
      'quatre épices',
      'pizza 4 fromages',
      'pain 5 céréales',
      '200-300 g rice',
      '4-3 eggs',
    ]) {
      expect(leadingCount(piece)).toBe(1);
    }
  });

  it('is conservative: no count, not a count, metric units and out-of-range stay 1', () => {
    for (const piece of [
      'eggs',
      '7up',
      '3d printed',
      'ag',
      'some rice',
      'quelques noix',
      '200 ml milk',
      '0 eggs',
      '500 eggs',
      '1/0 pie',
    ]) {
      expect(leadingCount(piece)).toBe(1);
    }
  });
});

describe('describeLocally counts', () => {
  const eggMatch = foodMatch({
    food: food('egg', 'Egg', 'protein'),
    confidence: 0.9,
    presets: [portion('1 egg', 50)],
  });
  const catalog = catalogOf({
    eggs: [eggMatch],
    'eggs 120 g': [eggMatch],
    œufs: [eggMatch],
    pain: [
      foodMatch({
        food: food('bread', 'Bread'),
        confidence: 0.9,
        presets: [portion('1 tranche', 30)],
      }),
    ],
    bread: [
      foodMatch({
        food: food('bread', 'Bread'),
        confidence: 0.9,
        presets: [portion('1 slice', 30)],
      }),
    ],
    avocado: [
      foodMatch({
        food: food('avo', 'Avocado'),
        confidence: 0.9,
        presets: [portion('1 avocado', 150)],
      }),
    ],
    banana: [
      foodMatch({
        food: food('ban', 'Banana'),
        confidence: 0.9,
        presets: [portion('1 banana', 120)],
      }),
    ],
  });
  const quantityOf = async (text: string, c: FoodCatalog = catalog) => {
    const out = await describeLocally(text, c);
    if (out.result.kind !== 'recognizedPlate') throw new Error('not a plate');
    return out.result.foods[0]?.quantity;
  };

  it('multiplies the default portion by a leading count, in English and French', async () => {
    expect(await quantityOf('3 eggs')).toMatchObject({
      low: 3,
      high: 3,
      grams: 150,
      gramsEstimated: true,
      displayLabel: '3 × 1 egg',
    });
    expect(await quantityOf('3 œufs')).toMatchObject({ low: 3, high: 3, grams: 150 });
    expect(await quantityOf('2 slices of bread')).toMatchObject({ low: 2, grams: 60 });
    expect(await quantityOf('2 tranches de pain')).toMatchObject({ low: 2, grams: 60 });
    expect(await quantityOf('½ avocado')).toMatchObject({ low: 0.5, grams: 75 });
    expect(await quantityOf('1/2 avocado')).toMatchObject({ low: 0.5, grams: 75 });
    expect(await quantityOf('1,5 avocado')).toMatchObject({ low: 1.5, grams: 225 });
  });

  it("does not scale when the matched food's own name contains the number", async () => {
    const pizza = foodMatch({
      food: food('p4', 'Pizza 4 fromages'),
      confidence: 0.9,
      presets: [portion('1 pizza', 400)],
    });
    const c = catalogOf({ 'fromages pizza': [pizza], '4 pizza': [pizza], pizza: [pizza] });
    // The number is a count by shape ("4 pizza"), but the match is "Pizza 4 fromages".
    expect(await quantityOf('4 pizza', c)).toMatchObject({ low: 1, high: 1 });
    // And a real count of a food whose name has no number still scales.
    expect(await quantityOf('3 eggs')).toMatchObject({ low: 3 });
  });

  it('counts "a dozen" and the lower bound of a range', async () => {
    expect(await quantityOf('a dozen eggs')).toMatchObject({ low: 12, high: 12 });
    expect(await quantityOf('3-4 eggs')).toMatchObject({ low: 3, high: 3 });
    expect(await quantityOf('2x eggs')).toMatchObject({ low: 2, high: 2 });
  });

  it('leaves "a banana" / "une pomme" at one portion, and no count unchanged', async () => {
    expect(await quantityOf('a banana')).toEqual(portion('1 banana', 120));
    expect(await quantityOf('eggs')).toEqual(portion('1 egg', 50));
  });

  it('counts each item of a list separately', async () => {
    const out = await describeLocally('2 eggs and 3 slices of bread', catalog);
    if (out.result.kind !== 'recognizedPlate') throw new Error('not a plate');
    expect(out.result.foods.map((f) => f.quantity.low)).toEqual([2, 3]);
  });

  it('lets grams typed in the text win over the count', async () => {
    const q = await quantityOf('2 eggs 120 g');
    expect(q).toMatchObject({ grams: 120, unit: 'g', low: 1, high: 1 });
  });

  it('never produces an invalid quantity ("500 eggs", "99 avocados")', async () => {
    expect(await quantityOf('500 eggs')).toEqual(portion('1 egg', 50));
    expect(await quantityOf('99 avocado')).toEqual(portion('1 avocado', 150)); // 14850 g > 5000
    expect(await quantityOf('99 eggs')).toMatchObject({ low: 99, grams: 4950 });
  });
});
