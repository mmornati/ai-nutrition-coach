import { describe, expect, it } from 'vitest';
import {
  applicableNutrientSuggestions,
  coachSuggestionFor,
  createCoachNoteGenerator,
  createTemplateCoach,
  databaseFood,
  EU_REFERENCE_INTAKES,
  gramsQuantity,
  openPlateSuggestionFor,
  plateLog,
  slotOfPlate,
  splitQuestionKey,
  withQuestionParams,
  type FoodGroup,
  type Nutrients,
  type PlateLog,
} from '../src/index';
import { FakeCoachNoteStore } from './helpers';

const T = EU_REFERENCE_INTAKES;
const local = (h: number, day = 16): number => new Date(2026, 7, day, h).getTime();

interface Item {
  readonly name: string;
  readonly group?: FoodGroup;
  readonly grams?: number;
  readonly per100?: Nutrients;
  readonly estimated?: boolean;
}

function plate(id: number, h: number, items: readonly Item[]): PlateLog {
  return plateLog({
    id,
    loggedAtUtc: local(h),
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
      quantity: gramsQuantity(it.grams ?? 100, { estimated: it.estimated ?? false }),
    })),
  });
}

const yogurt = (grams = 150, estimated = false): Item => ({
  name: 'Fruit yogurt',
  group: 'dairy',
  grams,
  estimated,
  per100: { energyKcal: 90, sugars: 12, protein: 4 },
});
const chicken = (grams = 150): Item => ({
  name: 'Chicken',
  group: 'protein',
  grams,
  per100: { energyKcal: 165, protein: 31, fibre: 0 },
});
const salad = (grams = 150): Item => ({
  name: 'Salad',
  group: 'vegFruit',
  grams,
  per100: { energyKcal: 20, protein: 1, fibre: 2 },
});

const rules = (p: PlateLog, earlier: readonly PlateLog[] = []) =>
  applicableNutrientSuggestions({
    plate: p,
    slot: slotOfPlate(p),
    earlierPlates: earlier,
    targets: T,
  });

describe('nutrient rules', () => {
  it('sugarsHighItem: a single entry with >= 15 g sugars, with raw numbers', () => {
    const s = rules(plate(1, 12, [yogurt(150)]))[0]!; // 18 g
    expect(s.pattern).toBe('sugarsHighItem');
    expect(s.params).toEqual({ food: 'Fruit yogurt', g: 18, pct: 20, est: 0 });
  });

  it('sugarsHighItem does not fire just under 15 g, nor on a late plate', () => {
    expect(rules(plate(1, 12, [yogurt(120)])).map((x) => x.pattern)).not.toContain(
      'sugarsHighItem',
    ); // 14.4 g
    expect(rules(plate(1, 23, [yogurt(150)])).map((x) => x.pattern)).not.toContain(
      'sugarsHighItem',
    );
  });

  it('marks an estimated figure', () => {
    expect(rules(plate(1, 12, [yogurt(150, true)]))[0]!.params.est).toBe(1);
  });

  it('saltHighPlate at 40% of the guide, not below', () => {
    const salty = (g: number): Item => ({
      name: 'Ham',
      group: 'protein',
      grams: g,
      per100: { salt: 2, protein: 20 },
    });
    expect(rules(plate(1, 12, [salty(120)]))[0]).toMatchObject({
      pattern: 'saltHighPlate',
      params: { g: 2.4, pct: 40 },
    }); // 2.4 g
    expect(rules(plate(1, 12, [salty(110)])).map((x) => x.pattern)).not.toContain('saltHighPlate');
  });

  it('satFatHighPlate at 50% of the guide', () => {
    const rich = (g: number): Item => ({
      name: 'Cheese',
      group: 'dairy',
      grams: g,
      per100: { saturatedFat: 20, protein: 25 },
    });
    expect(rules(plate(1, 12, [rich(50)]))[0]).toMatchObject({
      pattern: 'satFatHighPlate',
      params: { g: 10, pct: 50 },
    });
    expect(rules(plate(1, 12, [rich(45)])).map((x) => x.pattern)).not.toContain('satFatHighPlate');
  });

  it('energyDenseSnack: late, >= 400 kcal, no protein or veg', () => {
    const biscuits: Item = { name: 'Biscuits', grams: 80, per100: { energyKcal: 500 } };
    expect(rules(plate(1, 23, [biscuits]))[0]).toMatchObject({
      pattern: 'energyDenseSnack',
      params: { kcal: 400 },
    });
    expect(rules(plate(1, 23, [{ ...biscuits, grams: 70 }]))).toEqual([]);
    expect(rules(plate(1, 23, [biscuits, chicken(10)]))).toEqual([]);
    expect(rules(plate(1, 12, [biscuits])).map((x) => x.pattern)).not.toContain('energyDenseSnack');
  });

  it('proteinLowDay: lunch or dinner, day protein under 35% of the guide', () => {
    expect(rules(plate(1, 12, [salad(150)]))[0]).toMatchObject({
      pattern: 'proteinLowDay',
      params: { g: 1.5, pct: 3 },
    });
    const beans = (g: number): Item => ({
      name: 'Beans',
      group: 'protein',
      grams: 100,
      per100: { protein: g },
    });
    // 17 g is 34% of 50 g: low; 18 g is 36%: not.
    expect(rules(plate(1, 12, [beans(17)]))[0]!.pattern).toBe('proteinLowDay');
    expect(rules(plate(1, 12, [beans(18)]))).toEqual([]);
    // Earlier plates of the day count.
    expect(rules(plate(2, 12, [salad()]), [plate(1, 8, [chicken(150)])])).toEqual([]);
    // Not at breakfast.
    expect(rules(plate(1, 8, [salad()]))).toEqual([]);
  });

  it('fibreLowDay: dinner only, under 40% of the guide', () => {
    expect(rules(plate(1, 19, [chicken(200)]))[0]).toMatchObject({
      pattern: 'fibreLowDay',
      params: { zero: 1 },
    });
    expect(rules(plate(1, 12, [chicken(200)]))).toEqual([]);
  });

  it('an entry with unknown protein or fibre stops the day rules (a total would understate)', () => {
    const unknown: Item = { name: 'Mystery', group: 'starch', per100: { energyKcal: 100 } };
    expect(rules(plate(1, 19, [chicken(50), unknown])).map((x) => x.pattern)).toEqual([]);
    expect(rules(plate(1, 12, [salad(150), unknown])).map((x) => x.pattern)).toEqual([]);
  });

  it('unknown is not zero: a plate without the nutrient fires nothing', () => {
    expect(rules(plate(1, 19, [{ name: 'Mystery', group: 'protein' }]))).toEqual([]);
    expect(
      rules(plate(1, 19, [{ name: 'Mystery', group: 'protein', per100: { energyKcal: 100 } }])),
    ).toEqual([]);
  });

  it('priority: sugars, then salt, saturated fat, then the day rules', () => {
    const pastry: Item = {
      name: 'Pastry',
      group: 'starch',
      grams: 200,
      per100: { sugars: 20, salt: 2, saturatedFat: 10 },
    };
    expect(rules(plate(1, 19, [pastry])).map((x) => x.pattern)).toEqual([
      'sugarsHighItem',
      'saltHighPlate',
      'satFatHighPlate',
    ]);
  });
});

describe('coachSuggestionFor (nutrient layer over the food-group patterns)', () => {
  const p = plate(1, 12, [yogurt(150), chicken(100)]);

  it('prefers a nutrient rule, carrying its params', () => {
    expect(coachSuggestionFor(p, { targets: T })).toMatchObject({
      pattern: 'sugarsHighItem',
      params: { g: 18 },
    });
  });

  it('never repeats the previous pattern of the day', () => {
    const next = coachSuggestionFor(p, { targets: T, previousPattern: 'sugarsHighItem' });
    expect(next).not.toBeNull();
    expect(next?.pattern).not.toBe('sugarsHighItem');
  });

  it('without targets, behaves as the food-group coach (no params)', () => {
    const s = coachSuggestionFor(p, {});
    expect(s?.params).toEqual({});
    expect(s?.pattern).not.toBe('sugarsHighItem');
  });

  it('falls back to the group patterns when no rule fires', () => {
    const fine = plate(1, 12, [chicken(150), salad(150)]); // protein 47 g
    expect(coachSuggestionFor(fine, { targets: T })).toEqual({ pattern: 'balanced', params: {} });
  });

  it('is silent for a late plate with nothing to say', () => {
    expect(coachSuggestionFor(plate(1, 23, [salad()]), { targets: T })).toBeNull();
  });
});

describe('openPlateSuggestionFor', () => {
  it('hints protein from the day so far, once something was logged', () => {
    const logged = [plate(1, 8, [salad(100)])];
    expect(openPlateSuggestionFor({ dayPlates: logged, slot: 'lunch', targets: T })).toMatchObject({
      pattern: 'proteinLowDay',
    });
    expect(openPlateSuggestionFor({ dayPlates: [], slot: 'lunch', targets: T })).toBeNull();
    expect(openPlateSuggestionFor({ dayPlates: logged, slot: 'breakfast', targets: T })).toBeNull();
  });

  it('keeps the food-group hint when no targets are given', () => {
    const logged = [plate(1, 8, [chicken(100)])];
    expect(openPlateSuggestionFor({ dayPlates: logged, slot: 'lunch' })).toEqual({
      pattern: 'vegLight',
      params: {},
    });
  });
});

describe('note params live in the questionKey', () => {
  it('round-trips, including a food name with odd characters', () => {
    const params = { food: 'Yaourt & fruits? 100%', g: 18.5, est: 1 };
    const key = withQuestionParams('post.resolve.sugarsHighItem', params);
    expect(splitQuestionKey(key)).toEqual({ base: 'post.resolve.sugarsHighItem', params });
    expect(withQuestionParams('post.resolve.balanced', {})).toBe('post.resolve.balanced');
  });

  it('the generator stores the params, and the next note skips that pattern', async () => {
    const store = new FakeCoachNoteStore();
    const coach = createTemplateCoach((key, params) => `${key} ${String(params.g ?? '')}`);
    const gen = createCoachNoteGenerator({ coach, store, targets: () => T });
    const lunch = plate(1, 12, [yogurt(150)]);
    const r = await gen.generateFor(lunch, { dayPlates: [lunch] });
    if (r.kind !== 'coachNoteGenerated') throw new Error('expected a note');
    expect(r.note.questionKey).toBe(
      'post.resolve.sugarsHighItem?food=Fruit%20yogurt&g=18&pct=20&est=0',
    );
    expect(r.note.text).toBe('post.resolve.sugarsHighItem 18');

    const snack = plate(2, 16, [yogurt(150)]);
    const r2 = await gen.generateFor(snack, { dayPlates: [lunch, snack] });
    if (r2.kind === 'coachNoteGenerated') {
      expect(splitQuestionKey(r2.note.questionKey).base).not.toBe('post.resolve.sugarsHighItem');
    }
  });
});
