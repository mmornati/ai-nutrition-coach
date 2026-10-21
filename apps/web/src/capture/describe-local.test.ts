// The no-AI way to describe a meal: split on commas and "and" / "et", drop the amount, look each
// piece up in the on-device catalogue. Offline, nothing sent.
import { type DatabaseFood, type FoodCatalog, type FoodMatch, type QuantityRange } from '@anc/core';
import { describe, expect, it } from 'vitest';
import { describeLocally, searchTermOf, splitDescription } from './describe-local';

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
    expect(splitDescription('tea & toast + jam plus honey puis cake then soup')).toEqual([
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
    expect(out.result.foods[0]?.quantity.displayLabel).toBe('1 egg');
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
