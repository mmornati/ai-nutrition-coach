import { describe, expect, it } from 'vitest';
import {
  databaseFood,
  EU_REFERENCE_INTAKES,
  gramsQuantity,
  plateLog,
  weeklyReview,
  type FoodGroup,
  type Nutrients,
  isDayCountedForAverages,
  MAX_UNCOVERED_SHARE,
  localTime,
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
const TODAY = day(20, 9).getTime();
/** A finished day that passes the averages rule: two plates, each with usable data. */
const full = (n: number, items: Parameters<typeof plate>[1]): PlateLog[] => [
  plate(day(n, 8), items),
  plate(day(n, 19), items),
];

describe('weeklyReview', () => {
  it('an empty week has nothing to say', () => {
    const r = weeklyReview({ plates: [], today: TODAY, targets: T });
    expect(r).toMatchObject({
      daysLogged: 0,
      countedDays: 0,
      excludedDays: 0,
      wentWell: [],
      tryNext: null,
    });
    expect(r.averages).toEqual({});
  });

  it('counts days with plates, not plates, and does not say anything under three days', () => {
    const r = weeklyReview({
      plates: [plate(day(10, 8), [veg]), plate(day(10, 19), [meat]), plate(day(11), [veg])],
      today: TODAY,
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
        ...full(10, [meat]), // protein 75
        ...full(11, [meat, meat]), // 150
        ...full(12, [noData]), // logged, no data: not counted
      ],
      today: TODAY,
      targets: T,
    });
    expect(r.daysLogged).toBe(3);
    expect(r.countedDays).toBe(2);
    expect(r.excludedDays).toBe(1);
    expect(r.averages.protein).toBeCloseTo(112.5);
    expect(r.averages.fibre).toBeUndefined();
    expect(r.groupDays).toEqual({ veg: 0, protein: 2, starch: 1, dairy: 0 });
  });

  it('two positives at most and the first suggestion that holds', () => {
    const plates = [10, 11, 12, 13].flatMap((d) =>
      full(d, [veg, { group: 'protein', grams: 200, per100: { protein: 25, fibre: 8 } }]),
    );
    const r = weeklyReview({ plates, today: TODAY, targets: T });
    expect(r.wentWell.map((w) => w.key)).toEqual(['vegMostDays', 'proteinSteady']);
    expect(r.wentWell[0]!.params).toEqual({ days: 4, of: 4 });
    expect(r.tryNext).toBeNull();
  });

  it('suggests veg when fruit and veg were rare', () => {
    const plates = [10, 11, 12, 13].flatMap((d) => full(d, [meat]));
    const r = weeklyReview({ plates, today: TODAY, targets: T });
    expect(r.tryNext).toEqual({ key: 'moreVeg', params: { days: 0, of: 4 } });
  });

  it('suggests protein, fibre, salt or sugars in that order once veg is fine', () => {
    const lowProtein = [10, 11, 12].flatMap((d) =>
      full(d, [{ ...veg, per100: { protein: 1, fibre: 5 } }]),
    );
    expect(weeklyReview({ plates: lowProtein, today: TODAY, targets: T }).tryNext?.key).toBe(
      'moreProtein',
    );

    const salty = [10, 11, 12].flatMap((d) =>
      full(d, [{ group: 'vegFruit', grams: 400, per100: { protein: 10, fibre: 4, salt: 1.6 } }]),
    );
    expect(weeklyReview({ plates: salty, today: TODAY, targets: T }).tryNext?.key).toBe('easeSalt');

    const sweet = [10, 11, 12].flatMap((d) =>
      full(d, [{ group: 'vegFruit', grams: 400, per100: { protein: 10, fibre: 4, sugars: 25 } }]),
    );
    expect(weeklyReview({ plates: sweet, today: TODAY, targets: T }).tryNext?.key).toBe(
      'easeSugars',
    );
  });

  it('a topic is never both praised and suggested', () => {
    const plates = [10, 11, 12, 13].flatMap((d) => full(d, [veg, meat]));
    const r = weeklyReview({ plates, today: TODAY, targets: T });
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
    expect(weeklyReview({ plates, today: TODAY, targets: T }).daysLogged).toBe(3);
  });

  describe('which days the averages draw from', () => {
    const lowProtein = { group: 'vegFruit' as const, grams: 200, per100: { protein: 1, fibre: 1 } };

    it('leaves today out, however much of it is logged', () => {
      const plates = [...full(10, [meat]), ...full(20, [{ ...meat, grams: 1000 }])];
      const r = weeklyReview({ plates, today: TODAY, targets: T });
      expect(r.daysLogged).toBe(2);
      expect(r.countedDays).toBe(1);
      expect(r.excludedDays).toBe(0);
      expect(r.averages.protein).toBeCloseTo(75);
    });

    it('a half-logged today no longer drags the averages down or fires a suggestion', () => {
      const finished = [10, 11, 12, 13].flatMap((d) => full(d, [veg, meat]));
      const base = weeklyReview({ plates: finished, today: TODAY, targets: T });
      const withToday = weeklyReview({
        plates: [...finished, plate(day(20, 8), [lowProtein])],
        today: TODAY,
        targets: T,
      });
      expect(withToday.averages).toEqual(base.averages);
      expect(withToday.tryNext).toEqual(base.tryNext);
    });

    it('excludes a one-plate day and counts a two-plate day', () => {
      const r = weeklyReview({
        plates: [plate(day(10), [meat]), ...full(11, [meat])],
        today: TODAY,
        targets: T,
      });
      expect(r.daysLogged).toBe(2);
      expect(r.countedDays).toBe(1);
      expect(r.excludedDays).toBe(1);
    });

    it('a plate without usable data does not count toward the two', () => {
      const bare = { group: 'starch' as const };
      const plates = [plate(day(10, 8), [meat]), plate(day(10, 19), [bare])];
      const r = weeklyReview({ plates, today: TODAY, targets: T });
      expect(r.countedDays).toBe(0);
      expect(r.excludedDays).toBe(1);
      expect(r.averages).toEqual({});
    });

    it('under three counted days there is no protein or fibre suggestion', () => {
      // Five logged days, but only two pass the rule: low protein and fibre must stay silent.
      const thin = [12, 13, 14].map((d) => plate(day(d), [lowProtein]));
      const plates = [...full(10, [lowProtein]), ...full(11, [lowProtein]), ...thin];
      const r = weeklyReview({ plates, today: TODAY, targets: T });
      expect(r.daysLogged).toBe(5);
      expect(r.countedDays).toBe(2);
      expect(r.tryNext).toBeNull();
      // With a third counted day the same data does speak.
      const third = weeklyReview({
        plates: [...plates, ...full(15, [lowProtein])],
        today: TODAY,
        targets: T,
      });
      expect(third.countedDays).toBe(3);
      expect(third.tryNext?.key).toBe('moreProtein');
    });

    it('is a pure function of its inputs, and the injected day decides what is today', () => {
      const plates = [...full(10, [meat]), ...full(11, [meat]), ...full(12, [meat])];
      const input = { plates, today: TODAY, targets: T };
      expect(weeklyReview(input)).toEqual(weeklyReview(input));
      // The next day, the 12th is finished and counted; on the 12th itself it is not.
      expect(weeklyReview({ ...input, today: day(12, 23).getTime() }).countedDays).toBe(2);
      expect(weeklyReview({ ...input, today: day(13, 0).getTime() }).countedDays).toBe(3);
    });

    it('draws day boundaries in local calendar days across a DST change', () => {
      // Europe/Paris springs forward on 2026-03-29 (a 23-hour day); under TZ=Europe/Paris
      // (`pnpm test:dst`) the day before is finished and the DST day itself is "today".
      const at = (d: number, h: number) => plate(new Date(2026, 2, d, h), [meat]);
      const plates = [at(28, 8), at(28, 20), at(29, 0), at(29, 23)];
      const today = localTime(2026, 3, 29, 23, 59);
      const r = weeklyReview({ plates, today, targets: T });
      expect(r.daysLogged).toBe(2);
      expect(r.countedDays).toBe(1);
      const next = weeklyReview({ plates, today: localTime(2026, 3, 30, 0, 0), targets: T });
      expect(next.countedDays).toBe(2);
    });

    it('isDayCountedForAverages states the rule', () => {
      const two = full(10, [meat]);
      const day10 = day(10).getTime();
      expect(isDayCountedForAverages({ day: day10, today: TODAY, plates: two })).toBe(true);
      expect(isDayCountedForAverages({ day: day10, today: TODAY, plates: two.slice(0, 1) })).toBe(
        false,
      );
      expect(isDayCountedForAverages({ day: day10, today: day10, plates: two })).toBe(false);
    });
  });
});

describe('weeklyReview: foods that leave a nutrient out', () => {
  // Three finished days of protein-poor food that does not know its fibre or salt.
  const poor = { group: 'starch' as const, grams: 100, per100: { energyKcal: 200, protein: 2 } };

  it('records the foods missing each nutrient on the counted days', () => {
    const plates = [10, 11, 12].flatMap((n) => full(n, [poor]));
    const r = weeklyReview({ plates, today: TODAY, targets: T });
    expect(r.countedDays).toBe(3);
    expect(r.gaps.fibre).toBe(6);
    expect(r.gaps.protein).toBeUndefined();
  });

  it('never says "more fibre" from an average that leaves foods out, but protein (complete) still can', () => {
    const plates = [10, 11, 12].flatMap((n) => full(n, [poor, veg]));
    const r = weeklyReview({ plates, today: TODAY, targets: T });
    expect(r.gaps.fibre).toBe(3 * 2);
    expect(r.tryNext?.key).not.toBe('moreFibre');
    expect(r.wentWell.map((w) => w.key)).not.toContain('fibreSteady');
  });
});

describe('weeklyReview: a small hole in the data does not silence the rules', () => {
  const grain = { group: 'starch' as const, grams: 200, per100: { energyKcal: 300, fibre: 8 } };
  const herb = { group: 'other' as const, grams: 2, per100: { energyKcal: 250 } }; // no fibre
  const stew = { group: 'other' as const, grams: 300, per100: { energyKcal: 150 } }; // no fibre

  it('one tiny uncovered herb still lets "fibre steady" through', () => {
    const plates = [10, 11, 12].flatMap((n) => full(n, [grain, herb]));
    const r = weeklyReview({ plates, today: TODAY, targets: T });
    expect(r.gaps.fibre).toBe(6);
    expect(r.uncoveredShare.fibre).toBeLessThan(MAX_UNCOVERED_SHARE);
    expect(r.wentWell.map((w) => w.key)).toContain('fibreSteady');
  });

  it('one large uncovered food silences it', () => {
    const plates = [10, 11, 12].flatMap((n) => full(n, [grain, stew]));
    const r = weeklyReview({ plates, today: TODAY, targets: T });
    expect(r.uncoveredShare.fibre).toBeGreaterThan(MAX_UNCOVERED_SHARE);
    expect(r.wentWell.map((w) => w.key)).not.toContain('fibreSteady');
  });

  it('veg days are counted over the counted days, not the days including today', () => {
    // Three finished days with veg, plus today with none: 3 of 3, not 3 of 4.
    const plates = [10, 11, 12].flatMap((n) => full(n, [veg, meat]));
    plates.push(plate(day(20, 8), [meat]));
    const r = weeklyReview({ plates, today: TODAY, targets: T });
    const veggie = r.wentWell.find((w) => w.key === 'vegMostDays');
    expect(veggie?.params).toEqual({ days: 3, of: 3 });
  });
});
