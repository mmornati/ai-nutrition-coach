import { describe, expect, it } from 'vitest';
import {
  databaseFood,
  EU_REFERENCE_INTAKES,
  gramsQuantity,
  plateLog,
  weeklyReview,
  type FoodGroup,
  type Nutrients,
  type PlateLog,
} from '../src/index';

const T = EU_REFERENCE_INTAKES;
let nextId = 1;

function plate(
  when: Date,
  items: readonly { group: FoodGroup; grams?: number; per100?: Nutrients }[],
): PlateLog {
  const id = nextId++;
  return plateLog({
    id,
    loggedAtUtc: when.getTime(),
    entries: items.map((it, i) => ({
      id: i + 1,
      plateLogId: id,
      databaseFood: databaseFood({
        sourceRef: `t:${id}:${i}`,
        displayName: `food ${i}`,
        source: 'manual',
        foodGroup: it.group,
        nutrientsPer100g: it.per100,
      }),
      quantity: gramsQuantity(it.grams ?? 100),
    })),
  });
}

const veg = { group: 'vegFruit' as const, grams: 200, per100: { fibre: 3, protein: 1, salt: 0.1 } };
const meat = { group: 'protein' as const, grams: 150, per100: { protein: 25, salt: 0.5 } };
const day = (n: number, h = 12) => new Date(2026, 9, n, h);

describe('weeklyReview', () => {
  it('an empty week has nothing to say', () => {
    const r = weeklyReview({ plates: [], targets: T });
    expect(r).toMatchObject({ daysLogged: 0, daysWithData: 0, wentWell: [], tryNext: null });
    expect(r.averages).toEqual({});
  });

  it('counts days with plates, not plates, and does not say anything under three days', () => {
    const r = weeklyReview({
      plates: [plate(day(10, 8), [veg]), plate(day(10, 19), [meat]), plate(day(11), [veg])],
      targets: T,
    });
    expect(r.daysLogged).toBe(2);
    expect(r.wentWell).toEqual([]);
    expect(r.tryNext).toBeNull();
  });

  it('averages over days with data only (partial data)', () => {
    const noData = { group: 'starch' as const };
    const r = weeklyReview({
      plates: [
        plate(day(10), [meat]), // protein 37.5
        plate(day(11), [meat, meat]), // 75
        plate(day(12), [noData]), // logged, no data
      ],
      targets: T,
    });
    expect(r.daysLogged).toBe(3);
    expect(r.daysWithData).toBe(2);
    expect(r.averages.protein).toBeCloseTo(56.25);
    expect(r.averages.fibre).toBeUndefined();
    expect(r.groupDays).toEqual({ veg: 0, protein: 2, starch: 1, dairy: 0 });
  });

  it('two positives at most and the first suggestion that holds', () => {
    const plates = [10, 11, 12, 13].map((d) =>
      plate(day(d), [veg, { group: 'protein', grams: 200, per100: { protein: 25, fibre: 8 } }]),
    );
    const r = weeklyReview({ plates, targets: T });
    expect(r.wentWell.map((w) => w.key)).toEqual(['vegMostDays', 'proteinSteady']);
    expect(r.wentWell[0]!.params).toEqual({ days: 4, of: 4 });
    expect(r.tryNext).toBeNull();
  });

  it('suggests veg when fruit and veg were rare', () => {
    const plates = [10, 11, 12, 13].map((d) => plate(day(d), [meat]));
    const r = weeklyReview({ plates, targets: T });
    expect(r.tryNext).toEqual({ key: 'moreVeg', params: { days: 0, of: 4 } });
  });

  it('suggests protein, fibre, salt or sugars in that order once veg is fine', () => {
    const lowProtein = [10, 11, 12].map((d) =>
      plate(day(d), [{ ...veg, per100: { protein: 1, fibre: 5 } }]),
    );
    expect(weeklyReview({ plates: lowProtein, targets: T }).tryNext?.key).toBe('moreProtein');

    const salty = [10, 11, 12].map((d) =>
      plate(day(d), [
        { group: 'vegFruit', grams: 400, per100: { protein: 10, fibre: 4, salt: 1.6 } },
      ]),
    );
    expect(weeklyReview({ plates: salty, targets: T }).tryNext?.key).toBe('easeSalt');

    const sweet = [10, 11, 12].map((d) =>
      plate(day(d), [
        { group: 'vegFruit', grams: 400, per100: { protein: 10, fibre: 4, sugars: 25 } },
      ]),
    );
    expect(weeklyReview({ plates: sweet, targets: T }).tryNext?.key).toBe('easeSugars');
  });

  it('a topic is never both praised and suggested', () => {
    const plates = [10, 11, 12, 13].map((d) => plate(day(d), [veg, meat]));
    const r = weeklyReview({ plates, targets: T });
    const praised = new Set(r.wentWell.map((w) => w.key));
    expect(praised.has('vegMostDays') && r.tryNext?.key === 'moreVeg').toBe(false);
  });

  it('groups plates into LOCAL days across a DST change', () => {
    // 2026-03-29 is the spring-forward day in Europe/Paris; late and early plates stay in their day.
    const plates = [
      plate(new Date(2026, 2, 28, 23, 30), [veg]),
      plate(new Date(2026, 2, 29, 0, 30), [veg]),
      plate(new Date(2026, 2, 29, 23, 30), [veg]),
      plate(new Date(2026, 2, 30, 0, 30), [veg]),
    ];
    expect(weeklyReview({ plates, targets: T }).daysLogged).toBe(3);
  });
});
