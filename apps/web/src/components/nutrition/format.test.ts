import { afterEach, describe, expect, it } from 'vitest';
import { databaseFood, type QuantityRange } from '@anc/core';
import { setCurrentLocale } from '../../i18n';
import { DEFAULT_LOCALE } from '../../i18n/locale';
import {
  entryQuantityText,
  formatAmount,
  formatNutrient,
  formatWeight,
  previewLine,
  scaleNutrients,
} from './format';

afterEach(() => setCurrentLocale(DEFAULT_LOCALE));

const yogurt = databaseFood({
  sourceRef: 'x',
  displayName: 'Yogurt',
  source: 'seed',
  nutrientsPer100g: { energyKcal: 70, protein: 6, sugars: 4.5, fat: 2 },
});

describe('nutrition formatting', () => {
  it('formats amounts: one decimal under 10, whole from 10, by locale', () => {
    expect(formatAmount(5.43, 'en')).toBe('5.4');
    expect(formatAmount(5.43, 'fr')).toBe('5,4');
    expect(formatAmount(9.96, 'en')).toBe('10');
    expect(formatAmount(12.6, 'en')).toBe('13');
    expect(formatAmount(0, 'en')).toBe('0');
  });

  it('words weights, with ≈ when they are guesses', () => {
    expect(formatWeight(150, false, 'en')).toBe('150 g');
    expect(formatWeight(150, true, 'en')).toBe('≈150 g');
    expect(formatWeight(1.5, false, 'fr')).toBe('1,5 g');
  });

  it('words nutrient values: whole kcal, tilde when estimated', () => {
    expect(formatNutrient('energyKcal', 209.6, false, 'en')).toBe('210 kcal');
    expect(formatNutrient('protein', 9, true, 'en')).toBe('~9 g');
  });

  it('scales per-100 g values to a weight and keeps unknowns unknown', () => {
    expect(scaleNutrients({ energyKcal: 70, protein: 6 }, 150)).toEqual({
      energyKcal: 105,
      protein: 9,
    });
  });

  it('previews energy, protein and sugars for a weight', () => {
    expect(previewLine(yogurt, 300, 'en')).toBe('≈ 210 kcal · 18 g protein · 14 g sugars');
    expect(previewLine(yogurt, 100, 'en')).toBe('≈ 70 kcal · 6 g protein · 4.5 g sugars');
    expect(previewLine(yogurt, 100, 'fr')).toBe('≈ 70 kcal · 6 g de protéines · 4,5 g de sucres');
  });

  it('previews only what the food knows, and nothing without data or weight', () => {
    const partial = databaseFood({
      sourceRef: 'y',
      displayName: 'Y',
      source: 'seed',
      nutrientsPer100g: { protein: 10 },
    });
    expect(previewLine(partial, 50, 'en')).toBe('≈ 5 g protein');
    const fatOnly = databaseFood({
      sourceRef: 'z',
      displayName: 'Z',
      source: 'seed',
      nutrientsPer100g: { fat: 10 },
    });
    expect(previewLine(fatOnly, 50, 'en')).toBeNull();
    expect(
      previewLine(databaseFood({ sourceRef: 'n', displayName: 'N', source: 'seed' }), 50, 'en'),
    ).toBeNull();
    expect(previewLine(yogurt, undefined, 'en')).toBeNull();
    expect(previewLine(undefined, 100, 'en')).toBeNull();
  });

  it('words an entry quantity: portion words, then the weight when known', () => {
    const fist: QuantityRange = { low: 1, high: 1, unit: 'fist', displayLabel: '~1 fist' };
    expect(entryQuantityText(fist, 'en')).toBe('~1 fist');
    expect(entryQuantityText({ ...fist, grams: 150, gramsEstimated: true }, 'en')).toBe(
      '~1 fist · ≈150 g',
    );
    expect(entryQuantityText({ ...fist, grams: 150, gramsEstimated: false }, 'en')).toBe(
      '~1 fist · 150 g',
    );
    const typed: QuantityRange = {
      low: 150,
      high: 150,
      unit: 'g',
      displayLabel: '150 g',
      grams: 150,
      gramsEstimated: false,
    };
    expect(entryQuantityText(typed, 'en')).toBe('150 g');
  });
});
