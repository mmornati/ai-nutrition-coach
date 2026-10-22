import {
  ALL_HISTORY_SCOPE,
  visibleDayScope,
  weekScope,
  type ExportResult,
  type PlateLog,
} from '@anc/core';
import { describe, expect, it } from 'vitest';
import { createJsonExporter, serializePlatesToJson } from './json-exporter';
import { FakeStore, entry, plate } from './testing';

const at = (d: number, h = 9): number => new Date(2026, 7, d, h).getTime();
const ids = async (p: Promise<ExportResult>): Promise<number[]> => {
  const r = await p;
  return r.kind === 'exportReady' ? r.plates.map((x) => x.id) : [];
};

describe('serializePlatesToJson', () => {
  it('includes grams, gramsEstimated, nutrientsPer100g and extra when present', () => {
    const base = entry(1, 1, 'Yogurt');
    const e = {
      ...base,
      databaseFood: {
        ...base.databaseFood,
        nutrientsPer100g: { energyKcal: 61 },
        extra: { nutriscoreGrade: 'a' as const, novaGroup: 1 as const },
      },
      quantity: { ...base.quantity, grams: 125, gramsEstimated: false },
    };
    const decoded = JSON.parse(serializePlatesToJson([plate(1, 0, [e])])) as {
      plates: { entries: { databaseFood: object; quantity: object }[] }[];
    };
    const out = decoded.plates[0]?.entries[0];
    expect(out?.databaseFood).toMatchObject({
      nutrientsPer100g: { energyKcal: 61 },
      extra: { nutriscoreGrade: 'a', novaGroup: 1 },
    });
    expect(out?.quantity).toMatchObject({ grams: 125, gramsEstimated: false });
  });

  it('envelope is exactly {"plates": [...]}', () => {
    const decoded = JSON.parse(serializePlatesToJson([])) as Record<string, unknown>;
    expect(Object.keys(decoded)).toEqual(['plates']);
    expect(decoded['plates']).toEqual([]);
  });

  it('adds savedMeals and recipes only when there are some, and leaves the plates as they are', () => {
    const food = {
      databaseFood: {
        sourceRef: 'recipe:3',
        displayName: 'Stew',
        source: 'recipe' as const,
        foodGroup: 'protein' as const,
        nutrientsPer100g: { energyKcal: 94.38 },
        extra: { nutrientsEstimated: true as const },
      },
      quantity: { low: 1, high: 1, unit: 'serving', displayLabel: '~1 serving', grams: 200 },
    };
    const meal = { id: 1, name: 'Usual', createdAtUtc: Date.UTC(2026, 7, 16, 9), entries: [food] };
    const recipe = {
      id: 3,
      name: 'Stew',
      createdAtUtc: Date.UTC(2026, 7, 17, 9),
      servings: 4,
      cookedWeightGrams: 800,
      ingredients: [food],
    };
    const decoded = JSON.parse(
      serializePlatesToJson([], undefined, { meals: [meal], recipes: [recipe] }),
    ) as Record<string, unknown>;
    expect(Object.keys(decoded)).toEqual(['plates', 'savedMeals', 'recipes']);
    expect(decoded['savedMeals']).toEqual([
      {
        id: 1,
        name: 'Usual',
        createdAtUtc: '2026-08-16T09:00:00.000Z',
        entries: [
          {
            databaseFood: food.databaseFood,
            quantity: food.quantity,
          },
        ],
      },
    ]);
    expect(decoded['recipes']).toMatchObject([
      { id: 3, name: 'Stew', servings: 4, cookedWeightGrams: 800 },
    ]);
    // Nothing kept: the envelope is untouched.
    expect(
      Object.keys(JSON.parse(serializePlatesToJson([], undefined, { meals: [], recipes: [] }))),
    ).toEqual(['plates']);
  });

  it('one plate one entry round-trips, with the food group', () => {
    const json = serializePlatesToJson([
      plate(1, Date.UTC(2026, 7, 16, 9), [entry(1, 1, 'Oatmeal')]),
    ]);
    const decoded = JSON.parse(json) as { plates: Record<string, unknown>[] };
    expect(decoded.plates).toHaveLength(1);
    const p = decoded.plates[0] as Record<string, unknown>;
    expect(p['id']).toBe(1);
    expect(p['loggedAtUtc']).toBe('2026-08-16T09:00:00.000Z');
    const e = (p['entries'] as Record<string, unknown>[])[0] as Record<string, unknown>;
    expect(e['databaseFood']).toEqual({
      source: 'manual',
      sourceRef: 'ref-1',
      displayName: 'Oatmeal',
      foodGroup: 'other',
    });
    expect(e['quantity']).toEqual({ low: 1, high: 2, unit: 'fist', displayLabel: '1–2 fists' });
  });
});

describe('JsonExporter', () => {
  const plates = (): PlateLog[] => [
    plate(1, at(10), [entry(1, 1, 'Before')]),
    plate(2, at(11), [entry(2, 2, 'Start')]),
    plate(3, at(17), [entry(3, 3, 'End')]),
    plate(4, at(18), [entry(4, 4, 'After')]),
  ];

  it('visibleDay filters to the local day', async () => {
    const ex = createJsonExporter(new FakeStore(plates()));
    expect(await ids(ex.readPlates({ scope: visibleDayScope(at(11, 20)) }))).toEqual([2]);
  });

  it('week filters to seven local days, newest first', async () => {
    const ex = createJsonExporter(new FakeStore(plates()));
    expect(await ids(ex.readPlates({ scope: weekScope(at(11, 0)) }))).toEqual([3, 2]);
  });

  it('allHistory returns the full list', async () => {
    const ex = createJsonExporter(new FakeStore(plates()));
    expect(await ids(ex.readPlates({ scope: ALL_HISTORY_SCOPE }))).toHaveLength(4);
  });

  it('streamPlates emits exportFormatFailure for csv', async () => {
    const ex = createJsonExporter(new FakeStore());
    const out: string[] = [];
    for await (const r of ex.streamPlates({ format: 'csv', scope: ALL_HISTORY_SCOPE }))
      out.push(r.kind);
    expect(out).toEqual(['exportFormatFailure']);
  });
});
