import { describe, expect, it } from 'vitest';
import {
  dayNutrients,
  databaseFood,
  entryNutrients,
  EU_REFERENCE_INTAKES,
  gramsQuantity,
  isValidQuantity,
  plateLog,
  plateNutrients,
  quantityRange,
  sanitizeFoodExtra,
  sanitizeNutrients,
  sumNutrients,
  updateQuantityRange,
  type FoodEntry,
  type Nutrients,
  type QuantityRange,
} from '../src/index';

const food = (nutrientsPer100g?: Nutrients) =>
  databaseFood({ sourceRef: 'r', displayName: 'F', source: 'ciqual', nutrientsPer100g });

const entry = (id: number, per100: Nutrients | undefined, quantity: QuantityRange): FoodEntry => ({
  id,
  plateLogId: 1,
  databaseFood: food(per100),
  quantity,
});

const noGrams: QuantityRange = { low: 1, high: 1, unit: 's', displayLabel: 's' };

describe('sanitizeNutrients', () => {
  it('rejects non-objects and empty results', () => {
    for (const v of [null, undefined, 3, 'x', [], {}, { unknown: 1 }]) {
      expect(sanitizeNutrients(v)).toBeUndefined();
    }
  });

  it('keeps valid keys, including a real zero', () => {
    expect(sanitizeNutrients({ energyKcal: 52, salt: 0, fibre: 2.4 })).toEqual({
      energyKcal: 52,
      salt: 0,
      fibre: 2.4,
    });
  });

  it('drops negative, non-finite, non-number and over-cap values', () => {
    expect(
      sanitizeNutrients({
        energyKcal: 901,
        protein: -1,
        fat: Number.NaN,
        fibre: Infinity,
        salt: '3',
        carbohydrate: 100.5,
        sugars: 100,
      }),
    ).toEqual({ sugars: 100 });
    expect(sanitizeNutrients({ energyKcal: 900, salt: 100, protein: 100 })).toEqual({
      energyKcal: 900,
      salt: 100,
      protein: 100,
    });
  });

  it('drops sugars above carbohydrate and saturated fat above fat only when both present', () => {
    expect(sanitizeNutrients({ carbohydrate: 10, sugars: 11, protein: 1 })).toEqual({
      carbohydrate: 10,
      protein: 1,
    });
    expect(sanitizeNutrients({ fat: 5, saturatedFat: 6, protein: 1 })).toEqual({
      fat: 5,
      protein: 1,
    });
    expect(sanitizeNutrients({ sugars: 50 })).toEqual({ sugars: 50 });
    expect(sanitizeNutrients({ saturatedFat: 50 })).toEqual({ saturatedFat: 50 });
    expect(sanitizeNutrients({ carbohydrate: 10, sugars: 10 })).toEqual({
      carbohydrate: 10,
      sugars: 10,
    });
  });

  it('reference intakes are the EU values', () => {
    expect(EU_REFERENCE_INTAKES).toEqual({
      energyKcal: 2000,
      fat: 70,
      saturatedFat: 20,
      carbohydrate: 260,
      sugars: 90,
      protein: 50,
      salt: 6,
      fibre: 25,
    });
  });
});

describe('QuantityRange grams', () => {
  it('stays backward compatible without grams', () => {
    const r = quantityRange({ low: 1, high: 2, unit: 'piece', displayLabel: '~1-2' });
    expect(r.ok).toBe(true);
    if (r.ok) expect('grams' in r.value).toBe(false);
  });

  it('validates grams: finite, > 0, <= 5000', () => {
    const base = { low: 1, high: 1, unit: 'g', displayLabel: 'x' };
    for (const grams of [0, -1, Number.NaN, Infinity, 5001]) {
      expect(quantityRange({ ...base, grams }).ok).toBe(false);
      expect(isValidQuantity({ ...base, grams })).toBe(false);
    }
    for (const grams of [0.1, 250, 5000]) {
      expect(quantityRange({ ...base, grams, gramsEstimated: true }).ok).toBe(true);
    }
  });

  it('keeps grams through updateQuantityRange', () => {
    const q = gramsQuantity(100);
    const r = updateQuantityRange(q, { displayLabel: 'x' });
    expect(r.ok && r.value.grams).toBe(100);
    expect(updateQuantityRange(q, { grams: 0 }).ok).toBe(false);
  });

  it('gramsQuantity builds a typed or estimated weight', () => {
    expect(gramsQuantity(150)).toEqual({
      low: 150,
      high: 150,
      unit: 'g',
      displayLabel: '150 g',
      grams: 150,
      gramsEstimated: false,
    });
    expect(gramsQuantity(30, { estimated: true, displayLabel: '~30 g' })).toMatchObject({
      displayLabel: '~30 g',
      gramsEstimated: true,
    });
  });
});

describe('databaseFood', () => {
  it('sanitizes nutrients and extra, and omits them when empty', () => {
    expect(food()).not.toHaveProperty('nutrientsPer100g');
    expect(food()).not.toHaveProperty('extra');
    const f = databaseFood({
      sourceRef: 'r',
      displayName: 'F',
      source: 'off',
      nutrientsPer100g: { energyKcal: 50, protein: -2 },
      extra: { nutriscoreGrade: 'b', novaGroup: 4 },
    });
    expect(f.nutrientsPer100g).toEqual({ energyKcal: 50 });
    expect(f.extra).toEqual({ nutriscoreGrade: 'b', novaGroup: 4 });
    expect(databaseFood({ sourceRef: 'r', displayName: 'F', source: 'ciqual' }).source).toBe(
      'ciqual',
    );
  });

  it('sanitizeFoodExtra keeps only valid grades and groups', () => {
    expect(sanitizeFoodExtra({ nutriscoreGrade: 'z', novaGroup: 5 })).toBeUndefined();
    expect(sanitizeFoodExtra({ nutriscoreGrade: 'A', novaGroup: 2 })).toEqual({ novaGroup: 2 });
    expect(sanitizeFoodExtra('x')).toBeUndefined();
  });

  it('sanitizeFoodExtra keeps nutrientsEstimated only when exactly true', () => {
    expect(sanitizeFoodExtra({ nutrientsEstimated: true })).toEqual({ nutrientsEstimated: true });
    expect(sanitizeFoodExtra({ nutrientsEstimated: 'yes' })).toBeUndefined();
    expect(sanitizeFoodExtra({ nutrientsEstimated: false })).toBeUndefined();
    expect(sanitizeFoodExtra({ novaGroup: 1, nutrientsEstimated: true })).toEqual({
      novaGroup: 1,
      nutrientsEstimated: true,
    });
  });
});

describe('nutrient totals', () => {
  const yogurt = { energyKcal: 60, sugars: 12, protein: 4 };

  it('scales per 100 g by grams without rounding', () => {
    const n = entryNutrients(entry(1, yogurt, gramsQuantity(125)));
    expect(n?.energyKcal).toBeCloseTo(75, 10);
    expect(n?.sugars).toBeCloseTo(15, 10);
    expect(n).not.toHaveProperty('fat');
    expect(entryNutrients(entry(1, { protein: 3.3 }, gramsQuantity(33)))?.protein).toBeCloseTo(
      1.089,
      10,
    );
  });

  it('is undefined when grams or nutrients are unknown', () => {
    expect(entryNutrients(entry(1, yogurt, noGrams))).toBeUndefined();
    expect(entryNutrients(entry(1, undefined, gramsQuantity(100)))).toBeUndefined();
  });

  it('unknown is not zero: a key only appears if a counted entry has it', () => {
    const t = sumNutrients([
      entry(1, { energyKcal: 100, fibre: 0 }, gramsQuantity(100)),
      entry(2, { energyKcal: 50 }, gramsQuantity(200)),
    ]);
    expect(t.totals).toEqual({ energyKcal: 200, fibre: 0 });
    expect(t.totals).not.toHaveProperty('salt');
  });

  it('counts partial coverage and flags estimates', () => {
    const t = sumNutrients([
      entry(1, yogurt, gramsQuantity(100)),
      entry(2, undefined, gramsQuantity(100)),
      entry(3, yogurt, noGrams),
    ]);
    expect(t).toMatchObject({ entriesCounted: 1, entriesTotal: 3, estimated: false });
    const e = sumNutrients([entry(1, yogurt, gramsQuantity(100, { estimated: true }))]);
    expect(e.estimated).toBe(true);
    const modelFood = databaseFood({
      sourceRef: 'm',
      displayName: 'M',
      source: 'manual',
      nutrientsPer100g: yogurt,
      extra: { nutrientsEstimated: true },
    });
    const viaModel = sumNutrients([
      { id: 1, plateLogId: 1, databaseFood: modelFood, quantity: gramsQuantity(100) },
    ]);
    expect(viaModel.estimated).toBe(true);
    expect(sumNutrients([])).toEqual({
      totals: {},
      entriesCounted: 0,
      entriesTotal: 0,
      estimated: false,
    });
  });

  it('keeps full precision (no rounding in sums)', () => {
    const t = sumNutrients([
      entry(1, { protein: 0.1 }, gramsQuantity(100)),
      entry(2, { protein: 0.2 }, gramsQuantity(100)),
    ]);
    expect(t.totals.protein).toBe(0.1 + 0.2);
  });

  it('sums a plate and a day', () => {
    const a = plateLog({
      id: 1,
      loggedAtUtc: 0,
      entries: [entry(1, { energyKcal: 100 }, gramsQuantity(100))],
    });
    const b = plateLog({
      id: 2,
      loggedAtUtc: 1,
      entries: [entry(2, { energyKcal: 100 }, gramsQuantity(50))],
    });
    expect(plateNutrients(a).totals).toEqual({ energyKcal: 100 });
    expect(dayNutrients([a, b])).toMatchObject({ totals: { energyKcal: 150 }, entriesTotal: 2 });
  });
});
