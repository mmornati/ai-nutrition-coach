import { describe, expect, it } from 'vitest';
import { EMPTY_CUSTOM_FOOD, parseCustomFood, type CustomFoodInput } from './custom-food';

const input = (patch: Partial<CustomFoodInput>): CustomFoodInput => ({
  ...EMPTY_CUSTOM_FOOD,
  name: 'Stew',
  ...patch,
});

describe('parseCustomFood', () => {
  it('a name alone is the original ~1 serving with no weight and no numbers', () => {
    const r = parseCustomFood(input({}));
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.draft.quantity.grams).toBeUndefined();
    expect(r.draft.databaseFood.nutrientsPer100g).toBeUndefined();
    expect(r.draft.databaseFood.source).toBe('manual');
    expect(r.counts).toBe(false);
  });

  it('needs a name', () => {
    expect(parseCustomFood(input({ name: '  ' }))).toEqual({
      kind: 'invalid',
      issue: { kind: 'name' },
    });
  });

  it('per 100 g: the weight eaten and the values as typed (comma decimals accepted)', () => {
    const r = parseCustomFood(
      input({ grams: '250', values: { energyKcal: '120', protein: '4,5', fibre: '2' } }),
    );
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.draft.quantity).toMatchObject({ grams: 250, gramsEstimated: false, unit: 'g' });
    expect(r.draft.databaseFood.nutrientsPer100g).toEqual({
      energyKcal: 120,
      protein: 4.5,
      fibre: 2,
    });
    expect(r.counts).toBe(true);
  });

  it('per serving: values are converted to per 100 g by the serving weight, one serving eaten', () => {
    const r = parseCustomFood(
      input({ basis: 'perServing', grams: '50', values: { energyKcal: '200', salt: '0,5' } }),
    );
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.draft.quantity).toMatchObject({ unit: 'serving', low: 1, high: 1, grams: 50 });
    expect(r.draft.databaseFood.nutrientsPer100g).toEqual({ energyKcal: 400, salt: 1 });
  });

  it('refuses values without a weight, a bad weight and a bad number', () => {
    expect(parseCustomFood(input({ values: { energyKcal: '100' } }))).toEqual({
      kind: 'invalid',
      issue: { kind: 'needsGrams' },
    });
    expect(parseCustomFood(input({ grams: '0' }))).toEqual({
      kind: 'invalid',
      issue: { kind: 'grams' },
    });
    expect(parseCustomFood(input({ grams: '10', values: { protein: 'lots' } }))).toEqual({
      kind: 'invalid',
      issue: { kind: 'value', field: 'protein' },
    });
    expect(parseCustomFood(input({ grams: '10', values: { protein: '-3' } })).kind).toBe('invalid');
  });

  it('refuses what no food can hold per 100 g, including after the serving conversion', () => {
    expect(parseCustomFood(input({ grams: '100', values: { energyKcal: '950' } }))).toEqual({
      kind: 'invalid',
      issue: { kind: 'tooHigh', field: 'energyKcal' },
    });
    // 200 kcal in a 20 g serving is 1000 kcal per 100 g.
    expect(
      parseCustomFood(input({ basis: 'perServing', grams: '20', values: { energyKcal: '200' } })),
    ).toEqual({ kind: 'invalid', issue: { kind: 'tooHigh', field: 'energyKcal' } });
  });

  it('refuses an ambiguous thousands-style comma in both languages, keeps real decimals', () => {
    for (const text of ['1,200', '12,500', '123,456']) {
      expect(parseCustomFood(input({ grams: '100', values: { energyKcal: text } }))).toEqual({
        kind: 'invalid',
        issue: { kind: 'value', field: 'energyKcal' },
      });
    }
    const ok = parseCustomFood(input({ grams: '100', values: { protein: '1,2', fat: '4,25' } }));
    expect(ok.kind === 'ok' && ok.draft.databaseFood.nutrientsPer100g).toEqual({
      protein: 1.2,
      fat: 4.25,
    });
  });

  it('catches kJ typed as kcal where it passes the per-100 g ceiling, with or without a serving', () => {
    // 1,500 kJ is about 360 kcal; typed as kcal it is 1500 per 100 g.
    expect(parseCustomFood(input({ grams: '100', values: { energyKcal: '1500' } }))).toEqual({
      kind: 'invalid',
      issue: { kind: 'tooHigh', field: 'energyKcal' },
    });
    // 600 kJ in a 30 g serving is 2000 per 100 g.
    expect(
      parseCustomFood(input({ basis: 'perServing', grams: '30', values: { energyKcal: '600' } })),
    ).toEqual({ kind: 'invalid', issue: { kind: 'tooHigh', field: 'energyKcal' } });
  });

  it('refuses macros that weigh more than 100 g per 100 g', () => {
    expect(
      parseCustomFood(
        input({ grams: '100', values: { protein: '40', carbohydrate: '40', fat: '25' } }),
      ),
    ).toEqual({ kind: 'invalid', issue: { kind: 'macros' } });
    // Per serving: 60 g of fat and 50 g of carbohydrate in a 100 g serving is 110 g.
    expect(
      parseCustomFood(
        input({ basis: 'perServing', grams: '100', values: { fat: '60', carbohydrate: '50' } }),
      ),
    ).toEqual({ kind: 'invalid', issue: { kind: 'macros' } });
    // Exactly 100 g is a pure mixture, not an error.
    expect(
      parseCustomFood(input({ grams: '100', values: { protein: '50', carbohydrate: '50' } })).kind,
    ).toBe('ok');
  });

  it('sugars cannot exceed carbohydrate, nor saturates fat', () => {
    expect(
      parseCustomFood(input({ grams: '100', values: { carbohydrate: '10', sugars: '12' } })),
    ).toEqual({ kind: 'invalid', issue: { kind: 'sugars' } });
    expect(
      parseCustomFood(input({ grams: '100', values: { fat: '5', saturatedFat: '6' } })),
    ).toEqual({ kind: 'invalid', issue: { kind: 'saturates' } });
  });

  it('a weight without values is a weighed food with no nutrition', () => {
    const r = parseCustomFood(input({ grams: '80' }));
    expect(r.kind === 'ok' && r.draft.quantity.grams).toBe(80);
    expect(r.kind === 'ok' && r.counts).toBe(false);
  });
});
