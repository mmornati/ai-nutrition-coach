import { describe, expect, it } from 'vitest';
import { parseResponse } from './off-barcode-source';

const product = (extra: Record<string, unknown>) => ({
  status: 1,
  product: { product_name: 'Yaourt', ...extra },
});
const parse = (extra: Record<string, unknown>) => {
  const r = parseResponse('1', 200, product(extra), 'en');
  if (r.kind !== 'match') throw new Error('expected match');
  return r;
};

describe('OFF nutrition parsing', () => {
  it('reads the per-100 g nutriments, numbers or numeric strings', () => {
    const r = parse({
      nutriments: {
        'energy-kcal_100g': 539,
        proteins_100g: '6.3',
        carbohydrates_100g: 57.5,
        sugars_100g: 56.3,
        fat_100g: 30.9,
        'saturated-fat_100g': 10.6,
        fiber_100g: 3.4,
        salt_100g: 0.107,
      },
    });
    expect(r.nutrientsPer100g).toEqual({
      energyKcal: 539,
      protein: 6.3,
      carbohydrate: 57.5,
      sugars: 56.3,
      fat: 30.9,
      saturatedFat: 10.6,
      fibre: 3.4,
      salt: 0.107,
    });
  });

  it('falls back to kJ / 4.184 only when kcal is absent', () => {
    expect(parse({ nutriments: { energy_100g: 418.4 } }).nutrientsPer100g?.energyKcal).toBe(100);
    expect(
      parse({ nutriments: { 'energy-kcal_100g': 50, energy_100g: 2000 } }).nutrientsPer100g
        ?.energyKcal,
    ).toBe(50);
  });

  it('falls back to sodium x 2.5 only when salt is absent', () => {
    expect(parse({ nutriments: { sodium_100g: 0.4 } }).nutrientsPer100g?.salt).toBe(1);
    expect(parse({ nutriments: { salt_100g: 2, sodium_100g: 0.4 } }).nutrientsPer100g?.salt).toBe(
      2,
    );
  });

  it('keeps missing as missing, a real zero as zero', () => {
    const n = parse({ nutriments: { proteins_100g: 0, fat_100g: 3 } }).nutrientsPer100g;
    expect(n).toEqual({ protein: 0, fat: 3 });
    expect(n && 'energyKcal' in n).toBe(false);
  });

  it('drops garbage rather than inventing numbers', () => {
    const r = parse({
      nutriments: {
        'energy-kcal_100g': 'lots',
        proteins_100g: -4,
        fat_100g: 1e9,
        carbohydrates_100g: 10,
        sugars_100g: 40, // above carbohydrate: dropped
        fiber_100g: null,
        salt_100g: {},
      },
    });
    expect(r.nutrientsPer100g).toEqual({ carbohydrate: 10 });
    expect(parse({ nutriments: 'x' }).nutrientsPer100g).toBeUndefined();
    expect(parse({ nutriments: [1, 2] }).nutrientsPer100g).toBeUndefined();
    expect(parse({}).nutrientsPer100g).toBeUndefined();
  });

  it('reads Nutri-Score and NOVA, ignoring anything else', () => {
    expect(parse({ nutriscore_grade: 'E', nova_group: 4 }).extra).toEqual({
      nutriscoreGrade: 'e',
      novaGroup: 4,
    });
    expect(parse({ nutriscore_grade: '3', nova_group: '2' }).extra).toEqual({ novaGroup: 2 });
    expect(parse({ nutriscore_grade: 'unknown', nova_group: 9 }).extra).toBeUndefined();
  });

  it('reads the serving and the pack in g or ml, within limits', () => {
    const r = parse({
      serving_quantity: '30',
      serving_quantity_unit: 'g',
      product_quantity: 500,
      product_quantity_unit: 'ml',
    });
    expect([r.servingGrams, r.packGrams]).toEqual([30, 500]);
    const big = parse({ product_quantity: 2500, serving_quantity: 0 });
    expect([big.servingGrams, big.packGrams]).toEqual([undefined, undefined]);
    expect(
      parse({ serving_quantity: 30, serving_quantity_unit: 'oz' }).servingGrams,
    ).toBeUndefined();
    expect(parse({ product_quantity: 2000 }).packGrams).toBe(2000);
  });

  it('a product with none of these still matches exactly as before', () => {
    expect(parse({})).toEqual({
      kind: 'match',
      barcode: '1',
      displayName: 'Yaourt',
      categoryTags: [],
    });
  });
});
