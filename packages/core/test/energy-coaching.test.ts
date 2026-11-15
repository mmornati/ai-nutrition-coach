import { describe, expect, it } from 'vitest';
import {
  coachGoalContext,
  coachSuggestionFor,
  createCoachNoteGenerator,
  createTemplateCoach,
  dailyGuideFor,
  databaseFood,
  dayEnergySuggestion,
  ENERGY_RULES,
  gramsQuantity,
  isEndOfDay,
  ownFoods,
  plateLog,
  slotOfPlate,
  topEnergyFoods,
  trustedDayEnergy,
  type FoodGroup,
  type GoalContext,
  type Nutrients,
  type PlateLog,
  type Profile,
} from '../src/index';
import { FakeCoachNoteStore } from './helpers';

const local = (h: number, day = 16): number => new Date(2026, 7, day, h).getTime();

interface Item {
  readonly name: string;
  readonly group?: FoodGroup;
  readonly grams?: number;
  readonly per100?: Nutrients;
}
function plate(
  id: number,
  h: number,
  items: readonly Item[],
  day = 16,
  slot?: PlateLog['slot'],
): PlateLog {
  return plateLog({
    id,
    loggedAtUtc: local(h, day),
    slot,
    entries: items.map((it, i) => ({
      id: i + 1,
      plateLogId: id,
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

const pizza: Item = {
  name: 'Pizza',
  group: 'starch',
  grams: 400,
  per100: { energyKcal: 250, protein: 10 },
}; // 1000
const soda: Item = { name: 'Soda', grams: 500, per100: { energyKcal: 42, sugars: 10.6 } }; // 210
const salad: Item = {
  name: 'Salad',
  group: 'vegFruit',
  grams: 150,
  per100: { energyKcal: 20, fibre: 2 },
}; // 30
const rice: Item = { name: 'Rice', group: 'starch', grams: 200, per100: { energyKcal: 130 } }; // 260
const chicken: Item = {
  name: 'Chicken',
  group: 'protein',
  grams: 150,
  per100: { energyKcal: 165, protein: 31 },
};

const lose: GoalContext = { goal: 'lose', guideKcal: 1900 };
const maintain: GoalContext = { goal: 'maintain', guideKcal: 1900 };

describe('the day against the personal guide', () => {
  const day = [plate(1, 8, [salad]), plate(2, 12, [rice, chicken]), plate(3, 19, [pizza, soda])];

  it('well above the guide (lose): names the foods that carried the energy and asks', () => {
    // 30 + 260+248 + 1000+210 = 1748; make it bigger.
    const big = [...day.slice(0, 2), plate(3, 19, [pizza, pizza, soda])];
    const s = dayEnergySuggestion({ dayPlates: big, goal: lose });
    expect(s).toMatchObject({ pattern: 'energyHighDay' });
    expect(s?.params).toMatchObject({ food: 'Pizza', est: 0 });
    // The named foods carry the energy: kcal rounded to 50.
    expect(Number(s?.params['kcal']) % 50).toBe(0);
  });

  it('two foods are named when the second carries a real share', () => {
    const plates = [plate(1, 12, [pizza, soda, soda, soda]), plate(2, 19, [pizza, soda])];
    const s = dayEnergySuggestion({ dayPlates: plates, goal: lose });
    expect(s?.params).toMatchObject({ food: 'Pizza', food2: 'Soda' });
  });

  it('close to the guide says nothing about energy', () => {
    const near = [
      plate(1, 8, [rice]),
      plate(2, 12, [pizza]),
      plate(3, 19, [pizza, chicken, salad]),
    ];
    const total = trustedDayEnergy(near)?.kcal ?? 0;
    expect(total).toBeGreaterThan(1500);
    expect(
      dayEnergySuggestion({ dayPlates: near, goal: { goal: 'lose', guideKcal: total } }),
    ).toBeNull();
    expect(
      dayEnergySuggestion({ dayPlates: near, goal: { goal: 'lose', guideKcal: total * 1.1 } }),
    ).toBeNull();
  });

  it('the high threshold is 115 % for a lose goal and 130 % for any other', () => {
    const plates = [plate(1, 12, [pizza]), plate(2, 19, [pizza])]; // 2000
    const at = (share: number, goal: GoalContext['goal']) =>
      dayEnergySuggestion({ dayPlates: plates, goal: { goal, guideKcal: 2000 / share } });
    expect(at(1.14, 'lose')).toBeNull();
    expect(at(1.16, 'lose')).not.toBeNull();
    expect(at(1.2, 'maintain')).toBeNull();
    expect(at(1.2, undefined)).toBeNull();
    expect(at(1.31, 'maintain')).not.toBeNull();
    expect(at(1.31, 'eatBetter')).not.toBeNull();
    expect(ENERGY_RULES.highShare).toBe(1.15);
    expect(ENERGY_RULES.farHighShare).toBe(1.3);
  });

  it('well below the guide for a lose goal: one gentle line, only with three plates', () => {
    const light = [plate(1, 8, [salad]), plate(2, 12, [rice]), plate(3, 19, [chicken])]; // 538
    const s = dayEnergySuggestion({ dayPlates: light, goal: { goal: 'lose', guideKcal: 1900 } });
    expect(s).toMatchObject({ pattern: 'energyLowDay', params: { pct: 28 } });
    expect(dayEnergySuggestion({ dayPlates: light.slice(1), goal: lose })).toBeNull();
    // Never for a maintain goal, never for no goal.
    expect(dayEnergySuggestion({ dayPlates: light, goal: maintain })).toBeNull();
    expect(
      dayEnergySuggestion({ dayPlates: light, goal: { goal: undefined, guideKcal: 1900 } }),
    ).toBeNull();
  });

  it('gain mirrors it a little higher (80 %)', () => {
    const light = [plate(1, 8, [salad]), plate(2, 12, [rice]), plate(3, 19, [chicken])];
    const gain = (guide: number) =>
      dayEnergySuggestion({ dayPlates: light, goal: { goal: 'gain', guideKcal: guide } });
    expect(gain(1000)).toMatchObject({ pattern: 'energyLowDay' }); // 54 %
    expect(gain(670)).toBeNull(); // 80.3 %
  });

  it('never from partial totals: a food without weight or a hole in the energy data', () => {
    const unweighed = plate(3, 19, [pizza, pizza, soda]);
    const bare = plateLog({
      id: 9,
      loggedAtUtc: local(20),
      entries: [
        {
          id: 1,
          plateLogId: 9,
          databaseFood: databaseFood({ sourceRef: 'x', displayName: 'Mystery', source: 'manual' }),
          quantity: { low: 1, high: 1, unit: 'serving', displayLabel: '1 serving' },
        },
      ],
    });
    expect(dayEnergySuggestion({ dayPlates: [unweighed, bare], goal: lose })).toBeNull();
    const noEnergy = plate(8, 20, [{ name: 'Mystery', grams: 400 }]);
    expect(trustedDayEnergy([unweighed, noEnergy])).toBeNull();
    expect(dayEnergySuggestion({ dayPlates: [unweighed, noEnergy], goal: lose })).toBeNull();
  });

  it('without a personal guide there is no energy remark', () => {
    expect(
      dayEnergySuggestion({ dayPlates: [plate(1, 19, [pizza, pizza])], goal: { goal: 'lose' } }),
    ).toBeNull();
  });
});

describe('when the day is judged', () => {
  const order = [plate(1, 8, [salad]), plate(2, 12, [rice]), plate(3, 19, [pizza])];
  it('at dinner when it is the last plate; never at breakfast or lunch', () => {
    const [b, l, d] = order as [PlateLog, PlateLog, PlateLog];
    expect(isEndOfDay(d, slotOfPlate(d), [b, l], slotOfPlate)).toBe(true);
    expect(isEndOfDay(l, slotOfPlate(l), [b], slotOfPlate)).toBe(false);
    expect(isEndOfDay(b, slotOfPlate(b), [], slotOfPlate)).toBe(false);
    // A dinner that is not the last plate of the day does not close it.
    expect(isEndOfDay(d, slotOfPlate(d), [plate(4, 21, [salad])], slotOfPlate)).toBe(false);
  });

  it('a stored dinner slot counts even at noon, and a late plate after dinner closes the day', () => {
    const noonDinner = plate(5, 12, [pizza], 16, 'dinner');
    expect(slotOfPlate(noonDinner)).toBe('dinner');
    expect(isEndOfDay(noonDinner, 'dinner', [], slotOfPlate)).toBe(true);
    const [, , d] = order as [PlateLog, PlateLog, PlateLog];
    const late = plate(6, 23, [salad]);
    expect(isEndOfDay(late, 'late', [d], slotOfPlate)).toBe(true);
    const earlyLate = plate(7, 14, [salad], 16, 'snack');
    expect(isEndOfDay(earlyLate, 'snack', [order[0]!], slotOfPlate)).toBe(false);
  });
});

describe('the goal context and its safeguards', () => {
  const full: Profile = { ageBand: '30-49', sex: 'female', activity: 'moderate', heightCm: 165 };
  const ctx = (profile: Profile, weight: number | undefined, numbers = true) =>
    coachGoalContext(profile, dailyGuideFor(profile, weight), numbers);

  it('a personal guide gives its energy, only while numbers are on', () => {
    const c = ctx({ ...full, goal: 'lose' }, 70);
    expect(c.goal).toBe('lose');
    expect(c.guideKcal).toBeGreaterThan(1200);
    expect(ctx({ ...full, goal: 'lose' }, 70, false).guideKcal).toBeUndefined();
  });

  it('the EU reference intakes are not a personal guide: no energy figure', () => {
    expect(
      coachGoalContext({ goal: 'lose' }, dailyGuideFor({ goal: 'lose' }), true).guideKcal,
    ).toBeUndefined();
    expect(coachGoalContext(undefined, dailyGuideFor(), true)).toEqual({ goal: undefined });
  });

  it('pregnancy, an underweight BMI and 65 and over drop the goal: no weight talk', () => {
    expect(ctx({ ...full, goal: 'lose', pregnantOrBreastfeeding: true }, 70).goal).toBeUndefined();
    expect(ctx({ ...full, goal: 'lose' }, 45).goal).toBeUndefined(); // BMI < 18.5
    expect(ctx({ ...full, goal: 'lose', ageBand: '65+' }, 60).goal).toBeUndefined();
    expect(ctx({ ...full, goal: 'lose' }, 45).guideKcal).toBeUndefined();
  });
});

describe('own foods and satiety helpers', () => {
  const history = [
    plate(10, 12, [{ name: 'Lentils', group: 'protein', per100: { energyKcal: 116 } }], 14),
    plate(11, 19, [{ name: 'Lentils', group: 'protein', per100: { energyKcal: 116 } }], 15),
    plate(
      12,
      12,
      [
        { name: 'Ham', group: 'protein' },
        { name: 'Ham', group: 'protein' },
      ],
      15,
    ),
    plate(
      13,
      12,
      [
        { name: 'Carrots', group: 'vegFruit' },
        { name: 'Carrots', group: 'vegFruit' },
      ],
      15,
    ),
    plate(
      14,
      12,
      [
        { name: 'Yogurt', group: 'dairy' },
        { name: 'Yogurt', group: 'dairy' },
      ],
      15,
    ),
  ];

  it('names a food the person logs often, not charcuterie, not one they avoid', () => {
    expect(ownFoods({ history, group: 'protein' })).toEqual(['Lentils']);
    expect(ownFoods({ history, group: 'vegFruit' })).toEqual(['Carrots']);
    expect(ownFoods({ history, group: 'protein', exclude: ['lentils'] })).toEqual([]);
    expect(ownFoods({ history, group: 'vegFruit', profile: { allergies: ['carrot'] } })).toEqual(
      [],
    );
  });

  const withGoal = (p: PlateLog, goal: GoalContext, targets = true) =>
    coachSuggestionFor(p, {
      dayPlates: [],
      goal,
      history,
      profile: undefined,
      targets: targets ? undefined : undefined,
    });

  it('lose goal: a plate with no protein is offered the protein the person already eats', () => {
    const s = withGoal(
      plate(20, 12, [{ name: 'Pasta', group: 'starch', per100: { energyKcal: 150 } }]),
      {
        goal: 'lose',
      },
    );
    expect(s).toMatchObject({ pattern: 'proteinPlateLose', params: { food: 'Lentils' } });
  });

  it('lose goal: vegetable volume when the plate has none', () => {
    const s = withGoal(
      plate(21, 12, [
        { name: 'Lentils', group: 'protein' },
        { name: 'Rice', group: 'starch' },
      ]),
      {
        goal: 'lose',
      },
    );
    expect(s).toMatchObject({ pattern: 'vegVolumeLose', params: { food: 'Carrots' } });
  });

  it('no goal, or another goal: no satiety helper', () => {
    const pasta = plate(22, 12, [{ name: 'Pasta', group: 'starch' }]);
    expect(withGoal(pasta, { goal: 'maintain' })?.pattern).not.toBe('proteinPlateLose');
    expect(withGoal(pasta, { goal: undefined })?.pattern).not.toBe('proteinPlateLose');
  });

  it('lose goal: a sugary drink is named, with its sugars only while figures are on', () => {
    const drink = plate(23, 12, [
      { name: 'Cola', grams: 500, per100: { energyKcal: 42, sugars: 10.6 } },
      { name: 'Salad', group: 'vegFruit' },
    ]);
    const on = coachSuggestionFor(drink, {
      dayPlates: [],
      goal: { goal: 'lose' },
      targets: dailyGuideFor().targets,
    });
    expect(on).toMatchObject({ pattern: 'sugaryDrink', params: { food: 'Cola', g: 53 } });
    const off = coachSuggestionFor(drink, { dayPlates: [], goal: { goal: 'lose' } });
    expect(off).toMatchObject({ pattern: 'sugaryDrink', params: { food: 'Cola', nonum: 1 } });
    expect(off?.params['g']).toBeUndefined();
  });

  it('lose goal: wine is mentioned once it adds real energy, and never for another goal', () => {
    const wine = plate(24, 19, [
      { name: 'Red wine', grams: 250, per100: { energyKcal: 70 } },
      { name: 'Salad', group: 'vegFruit' },
      { name: 'Chicken', group: 'protein' },
    ]);
    expect(coachSuggestionFor(wine, { dayPlates: [], goal: { goal: 'lose' } })?.pattern).toBe(
      'alcoholDrink',
    );
    expect(
      coachSuggestionFor(wine, { dayPlates: [], goal: { goal: 'maintain' } })?.pattern,
    ).not.toBe('alcoholDrink');
  });
});

describe('the whole path: a day well above the guide at dinner', () => {
  it('writes one energy note naming the top foods, and carries food slots under a diet', async () => {
    const store = new FakeCoachNoteStore();
    const coach = createTemplateCoach((key, params) => `${key}|${JSON.stringify(params)}`);
    const gen = createCoachNoteGenerator({
      coach,
      store,
      goal: () => ({ goal: 'lose', guideKcal: 1500 }),
      targets: () => dailyGuideFor().targets,
      profile: () => ({ diet: 'vegan' }),
    });
    const dayPlates = [plate(1, 12, [rice, soda]), plate(2, 19, [pizza, pizza])];
    const result = await gen.generateFor(dayPlates[1]!, { dayPlates });
    expect(result.kind).toBe('coachNoteGenerated');
    const key = result.kind === 'coachNoteGenerated' ? result.note.questionKey : '';
    expect(key.startsWith('post.resolve.energyHighDay?food=Pizza')).toBe(true);
    // The top foods by energy are named from this day.
    expect(topEnergyFoods(dayPlates, 2).map((f) => f.name)).toEqual(['Pizza', 'Rice']);
  });
});

describe('the meal a plate was filed under decides how it is coached (schema v5)', () => {
  it('a snack filed by choice is not a meal to compose; a noon plate filed as dinner is dinner', () => {
    const pasta = [{ name: 'Pasta', group: 'starch' as const, per100: { energyKcal: 150 } }];
    const snackAtNoon = plate(40, 12, pasta, 16, 'snack');
    expect(slotOfPlate(snackAtNoon)).toBe('snack');
    expect(coachSuggestionFor(snackAtNoon, { dayPlates: [] })).toBeNull();
    const dinnerAtNoon = plate(41, 12, pasta, 16, 'dinner');
    expect(slotOfPlate(dinnerAtNoon)).toBe('dinner');
    expect(coachSuggestionFor(dinnerAtNoon, { dayPlates: [] })?.pattern).toBeDefined();
    // Without a stored meal the clock hour decides, as before.
    expect(slotOfPlate(plate(42, 12, pasta))).toBe('lunch');
  });
});
