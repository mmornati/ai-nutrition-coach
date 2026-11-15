import { describe, expect, it } from 'vitest';
import {
  databaseFood,
  EU_REFERENCE_INTAKES,
  gramsQuantity,
  plateLog,
  weeklyReview,
  stepOfferForWeekly,
  type FoodGroup,
  type GoalContext,
  type Nutrients,
  type PlateLog,
  type Profile,
} from '../src/index';

interface Item {
  readonly name: string;
  readonly group?: FoodGroup;
  readonly grams?: number;
  readonly per100?: Nutrients;
}
let id = 1;
const at = (n: number, h = 12) => new Date(2026, 9, n, h).getTime();
function plate(when: number, items: readonly Item[]): PlateLog {
  const pid = id++;
  return plateLog({
    id: pid,
    loggedAtUtc: when,
    entries: items.map((it, i) => ({
      id: i + 1,
      plateLogId: pid,
      databaseFood: databaseFood({
        sourceRef: `t:${it.name}`,
        displayName: it.name,
        source: 'manual',
        foodGroup: it.group ?? 'other',
        nutrientsPer100g: it.per100,
      }),
      quantity: gramsQuantity(it.grams ?? 100),
    })),
  });
}
const TODAY = at(20, 9);
const T = EU_REFERENCE_INTAKES;

const pizza: Item = {
  name: 'Pizza',
  group: 'starch',
  grams: 400,
  per100: { energyKcal: 260, protein: 10, fibre: 2 },
}; // 1040
const salad: Item = {
  name: 'Salad',
  group: 'vegFruit',
  grams: 200,
  per100: { energyKcal: 20, protein: 1, fibre: 3, salt: 0.1, sugars: 2 },
};
const chicken: Item = {
  name: 'Chicken',
  group: 'protein',
  grams: 150,
  per100: { energyKcal: 165, protein: 31, fibre: 1, salt: 0.2, sugars: 0 },
};
const rice: Item = {
  name: 'Rice',
  group: 'starch',
  grams: 250,
  per100: { energyKcal: 130, protein: 3, fibre: 1, salt: 0, sugars: 0 },
};

/** Five finished days, two plates each. */
const week = (a: Item[], b: Item[]): PlateLog[] =>
  [13, 14, 15, 16, 17].flatMap((n) => [plate(at(n, 12), a), plate(at(n, 19), b)]);

const lose: GoalContext = { goal: 'lose', guideKcal: 1900 };

describe('the week: energy against the personal guide', () => {
  it('averages the counted days and relates them to the guide, neutrally', () => {
    const plates = week([rice, chicken, salad], [pizza]); // ~ 325+248+40 + 1040 = 1653? computed below
    const r = weeklyReview({ plates, today: TODAY, targets: T, goal: lose });
    expect(r.energy).not.toBeNull();
    expect(r.energy?.days).toBe(5);
    expect(r.energy?.guideKcal).toBe(1900);
    expect(r.energy?.relation).toBe('below');
    const high = weeklyReview({
      plates: week([pizza, pizza], [pizza]),
      today: TODAY,
      targets: T,
      goal: lose,
    });
    expect(high.energy?.relation).toBe('farAbove');
  });

  it('has no energy line without a personal guide or with fewer than three trusted days', () => {
    const plates = week([rice, chicken], [pizza]);
    expect(weeklyReview({ plates, today: TODAY, targets: T }).energy).toBeNull();
    expect(
      weeklyReview({ plates, today: TODAY, targets: T, goal: { goal: 'lose' } }).energy,
    ).toBeNull();
    const two = plates.filter((p) => p.loggedAtUtc < at(15));
    expect(weeklyReview({ plates: two, today: TODAY, targets: T, goal: lose }).energy).toBeNull();
  });

  it('a day with an uncounted food is left out of the average, not guessed', () => {
    const mystery: Item = { name: 'Mystery', grams: 500 }; // weight, no nutrients: a hole
    const plates = week([rice, chicken, salad], [pizza]).map((p, i) =>
      i < 6 ? plate(p.loggedAtUtc, [mystery, rice]) : p,
    );
    const r = weeklyReview({ plates, today: TODAY, targets: T, goal: lose });
    // Days 13, 14, 15 now carry a food with no energy data: only two trusted days remain.
    expect(r.energy).toBeNull();
  });

  it('names the recurring energy-dense foods', () => {
    const r = weeklyReview({
      plates: week([rice, chicken, salad], [pizza]),
      today: TODAY,
      targets: T,
      goal: lose,
    });
    expect(r.energyFoods).toEqual(['Pizza']);
  });

  it('a lose goal with a week well above the guide: try next week names the top food', () => {
    const r = weeklyReview({
      plates: week([pizza, pizza], [pizza]),
      today: TODAY,
      targets: T,
      goal: { goal: 'lose', guideKcal: 1900 },
    });
    expect(r.tryNext).toMatchObject({ key: 'easeEnergy', params: { food: 'Pizza' } });
    expect(stepOfferForWeekly('easeEnergy', { food: 'Pizza' })).toEqual({
      id: 'smallerPortion',
      food: 'Pizza',
    });
  });

  it('a lose goal logging well under the guide: eating enough, never praise', () => {
    const light: Item = {
      name: 'Toast',
      group: 'starch',
      grams: 100,
      per100: { energyKcal: 250, protein: 8, fibre: 3, salt: 0.5, sugars: 3 },
    };
    const r = weeklyReview({
      plates: week([light, salad], [light, chicken]),
      today: TODAY,
      targets: T,
      goal: lose,
    });
    expect(r.energy?.relation).toBe('farBelow');
    expect(r.tryNext?.key).toBe('eatEnough');
  });

  it('for a maintain goal, energy is only a try-next when far above', () => {
    const slightly = weeklyReview({
      plates: week([pizza, salad], [pizza, chicken]),
      today: TODAY,
      targets: T,
      goal: { goal: 'maintain', guideKcal: 2300 },
    });
    expect(slightly.tryNext?.key).not.toBe('easeEnergy');
    const far = weeklyReview({
      plates: week([pizza, pizza], [pizza]),
      today: TODAY,
      targets: T,
      goal: { goal: 'maintain', guideKcal: 1900 },
    });
    expect(far.tryNext?.key).toBe('easeEnergy');
  });
});

describe('the weight trend next to the logged energy', () => {
  const plates = week([rice, chicken, salad], [pizza]);
  const near: GoalContext = { goal: 'lose', guideKcal: 1650 };
  const change = (kg: number, days = 28) => ({ kg, days, fromKg: 80 });

  it('describes a lower trend while the log is close to the guide', () => {
    const r = weeklyReview({
      plates,
      today: TODAY,
      targets: T,
      goal: near,
      weightChange: change(-0.3),
    });
    expect(r.weightLine).toEqual({
      direction: 'lower',
      kg: 0.3,
      days: 28,
      intake: 'near',
      mismatch: false,
    });
  });

  it('says calmly that estimates disagree when the log is well under the guide but the trend is flat', () => {
    const under: GoalContext = { goal: 'lose', guideKcal: 2400 };
    const r = weeklyReview({
      plates,
      today: TODAY,
      targets: T,
      goal: under,
      weightChange: change(0.1),
    });
    expect(r.weightLine).toMatchObject({ direction: 'steady', intake: 'below', mismatch: true });
  });

  it('only for a lose or gain goal, and only for about four weeks of data', () => {
    expect(
      weeklyReview({
        plates,
        today: TODAY,
        targets: T,
        goal: { goal: 'maintain', guideKcal: 1650 },
        weightChange: change(-1),
      }).weightLine,
    ).toBeNull();
    expect(
      weeklyReview({ plates, today: TODAY, targets: T, goal: near, weightChange: change(-1, 14) })
        .weightLine,
    ).toBeNull();
    expect(
      weeklyReview({ plates, today: TODAY, targets: T, goal: near, weightChange: null }).weightLine,
    ).toBeNull();
  });
});

describe('food-quality observations (PNNS-style): neutral, one at most', () => {
  const lentils: Item = {
    name: 'Lentilles vertes, cuites',
    group: 'protein',
    per100: { energyKcal: 116, protein: 9, fibre: 8, salt: 0, sugars: 1 },
  };
  const salmon: Item = {
    name: 'Saumon, cuit',
    group: 'protein',
    per100: { energyKcal: 200, protein: 22, fibre: 0, salt: 0.1, sugars: 0 },
  };
  const walnuts: Item = {
    name: 'Noix, séchées',
    group: 'protein',
    grams: 30,
    per100: { energyKcal: 650, protein: 15, fibre: 6, salt: 0, sugars: 3 },
  };
  const ham: Item = {
    name: 'Jambon blanc',
    group: 'protein',
    per100: { energyKcal: 110, protein: 20, fibre: 0, salt: 1.8, sugars: 0.5 },
  };
  const wholePasta: Item = {
    name: 'Pâtes complètes, cuites',
    group: 'starch',
    per100: { energyKcal: 140, protein: 5, fibre: 4, salt: 0, sugars: 1 },
  };
  const whitePasta: Item = {
    name: 'Pâtes, cuites',
    group: 'starch',
    per100: { energyKcal: 150, protein: 5, fibre: 1, salt: 0, sugars: 1 },
  };
  const base = [salad, chicken];
  const quality = (plates: PlateLog[], profile?: Profile) =>
    weeklyReview({ plates, today: TODAY, targets: T, profile }).quality;

  it('pulses on fewer than two days; not when they are there', () => {
    expect(quality(week(base, [rice]))).toMatchObject({ key: 'pulsesLow', params: { days: 0 } });
    const days = [13, 14].flatMap((n) => [
      plate(at(n, 12), [lentils, salad]),
      plate(at(n, 19), [salmon, walnuts]),
    ]);
    const rest = [15, 16, 17].flatMap((n) => [plate(at(n, 12), base), plate(at(n, 19), [rice])]);
    expect(quality([...days, ...rest])?.key).not.toBe('pulsesLow');
  });

  it('fish: not for a vegetarian, vegan, or a fish allergy', () => {
    const lentilWeek = week([lentils, salad, walnuts], [rice, wholePasta]);
    expect(quality(lentilWeek)).toMatchObject({ key: 'fishLow' });
    expect(quality(lentilWeek, { diet: 'vegetarian' })?.key).not.toBe('fishLow');
    expect(quality(lentilWeek, { diet: 'vegan' })?.key).not.toBe('fishLow');
    expect(quality(lentilWeek, { allergies: ['poisson'] })?.key).not.toBe('fishLow');
  });

  it('processed meat on four or more days comes first', () => {
    expect(quality(week([ham, salad], [lentils, rice]))).toMatchObject({
      key: 'processedMeatOften',
      params: { days: 5, of: 5 },
    });
  });

  it('wholegrain share and nuts, skipped on a nut allergy', () => {
    const w = week([lentils, salad, whitePasta], [salmon, whitePasta, wholePasta]);
    // pulses, fish present: wholegrain 5 of 15 starches is 33 %: no; nuts none: yes.
    expect(quality(w)).toMatchObject({ key: 'nutsNone' });
    expect(quality(w, { allergies: ['arachide'] })?.key).toBe('nutsNone');
    expect(quality(w, { allergies: ['fruits à coque'] })).toBeNull();
    const pale = week([lentils, salad, whitePasta], [salmon, whitePasta, walnuts]);
    expect(quality(pale)).toMatchObject({ key: 'wholegrainLow' });
  });

  it('stays silent on a thin week', () => {
    expect(quality(week(base, [rice]).slice(0, 6))).toBeNull();
  });
});
