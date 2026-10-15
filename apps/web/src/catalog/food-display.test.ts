// How a seed food and a portion read in each language, and what stays as it was logged.
import { describe, expect, it } from 'vitest';
import { databaseFood, type QuantityRange } from '@anc/core';
import { foodName, isKnownUnit, quantityLabel, seedName } from './food-display';
import { seedFoods } from './seed-foods';

const q = (low: number, high: number, unit: string, displayLabel = 'stored'): QuantityRange => ({
  low,
  high,
  unit,
  displayLabel,
});

describe('quantityLabel', () => {
  it('English reproduces the labels the seed list used to store', () => {
    expect(quantityLabel(q(1, 1, 'piece'), 'en')).toBe('~1 piece');
    expect(quantityLabel(q(2, 2, 'piece'), 'en')).toBe('~2 pieces');
    expect(quantityLabel(q(1, 2, 'piece'), 'en')).toBe('~1–2 pieces');
    expect(quantityLabel(q(0.5, 1, 'piece'), 'en')).toBe('~½–1 piece');
    expect(quantityLabel(q(0.5, 1, 'cup'), 'en')).toBe('~½–1 cup');
    expect(quantityLabel(q(1, 2, 'cup'), 'en')).toBe('~1–2 cups');
    expect(quantityLabel(q(1, 1, 'fist'), 'en')).toBe('~1 fist');
    expect(quantityLabel(q(1.5, 1.5, 'fist'), 'en')).toBe('~1.5 fists');
    expect(quantityLabel(q(1, 2, 'handful'), 'en')).toBe('~1–2 handfuls');
    expect(quantityLabel(q(1, 2, 'square'), 'en')).toBe('~1–2 squares');
    expect(quantityLabel(q(1, 1, 'tbsp'), 'en')).toBe('~1 tbsp');
    expect(quantityLabel(q(1, 1, 'can'), 'en')).toBe('~1 can');
    expect(quantityLabel(q(1, 1, 'serving'), 'en')).toBe('~1 serving');
  });

  it('every seed preset in English equals the label the list used to store', () => {
    // The labels as they were written by hand before they were built from the numbers.
    const stored: Record<string, string[]> = {
      apple: ['~1 piece', '~2 pieces'],
      avocado: ['~½–1 piece'],
      spinach: ['~1–2 cups'],
      salmon: ['~1 fist', '~1.5 fists'],
      eggs: ['~1–2 pieces', '~3 pieces'],
      tuna: ['~1 can'],
      bread: ['~1–2 slices'],
      butter: ['~1 tbsp'],
      mixedNuts: ['~1–2 handfuls'],
      darkChocolate: ['~1–2 squares'],
      yogurt: ['~½–1 cup', '~1 cup'],
    };
    for (const seed of seedFoods) {
      const expected = stored[seed.id];
      if (!expected) continue;
      expect(
        seed.presets.map((p) => quantityLabel({ ...p, displayLabel: '' }, 'en')),
        seed.id,
      ).toEqual(expected);
    }
  });

  it('French: unit names, plural by the top of the range, comma decimals, en dash ranges', () => {
    expect(quantityLabel(q(1, 1, 'piece'), 'fr')).toBe('~1 pièce');
    expect(quantityLabel(q(2, 2, 'piece'), 'fr')).toBe('~2 pièces');
    expect(quantityLabel(q(1, 2, 'cup'), 'fr')).toBe('~1–2 tasses');
    expect(quantityLabel(q(0.5, 1, 'cup'), 'fr')).toBe('~½–1 tasse');
    expect(quantityLabel(q(1.5, 1.5, 'fist'), 'fr')).toBe('~1,5 poing');
    expect(quantityLabel(q(1, 2, 'fist'), 'fr')).toBe('~1–2 poings');
    expect(quantityLabel(q(1, 2, 'handful'), 'fr')).toBe('~1–2 poignées');
    expect(quantityLabel(q(1, 2, 'slice'), 'fr')).toBe('~1–2 tranches');
    expect(quantityLabel(q(1, 2, 'square'), 'fr')).toBe('~1–2 carrés');
    expect(quantityLabel(q(1, 1, 'tbsp'), 'fr')).toBe('~1 c. à soupe');
    expect(quantityLabel(q(2, 2, 'tbsp'), 'fr')).toBe('~2 c. à soupe');
    expect(quantityLabel(q(1, 1, 'can'), 'fr')).toBe('~1 boîte');
    expect(quantityLabel(q(1, 1, 'serving'), 'fr')).toBe('~1 portion');
    expect(quantityLabel(q(2.5, 3, 'piece'), 'fr')).toBe('~2,5–3 pièces');
  });

  it('a unit the catalogue does not know keeps the stored label (a model’s free text)', () => {
    const hint = q(1, 1, 'about 2 fists', 'about 2 fists');
    expect(quantityLabel(hint, 'fr')).toBe('about 2 fists');
    expect(quantityLabel(hint, 'en')).toBe('about 2 fists');
    expect(quantityLabel(q(1, 1, 'toString', 'x'), 'fr')).toBe('x');
    expect(isKnownUnit('cup')).toBe(true);
    expect(isKnownUnit('about 2 fists')).toBe(false);
    expect(isKnownUnit('constructor')).toBe(false);
  });

  it('a label stored in English is shown in French for a known unit', () => {
    expect(quantityLabel(q(1, 2, 'cup', '~1–2 cups'), 'fr')).toBe('~1–2 tasses');
  });
});

describe('foodName', () => {
  const stored = (sourceRef: string, displayName: string, source: 'seed' | 'off' | 'manual') =>
    databaseFood({ sourceRef, displayName, source, foodGroup: 'protein' });

  it('a seed food is named from the catalogue, in the current language', () => {
    const chicken = stored('seed:chicken breast', 'Chicken Breast', 'seed');
    expect(foodName(chicken, 'en')).toBe('Chicken Breast');
    expect(foodName(chicken, 'fr')).toBe('Filet de poulet');
    expect(foodName(stored('seed:apple', 'Pomme', 'seed'), 'en')).toBe('Apple');
  });

  it('everything else keeps the text it was logged with', () => {
    expect(foodName(stored('3017620422003', 'Nutella', 'off'), 'fr')).toBe('Nutella');
    expect(foodName(stored('manual:salmon', 'Salmon', 'manual'), 'fr')).toBe('Salmon');
    expect(foodName(stored('byok-m-Rice', 'Rice', 'manual'), 'fr')).toBe('Rice');
    // A seed ref this build does not know (a later build's food) keeps its text.
    expect(foodName(stored('seed:dragonfruit', 'Dragonfruit', 'seed'), 'fr')).toBe('Dragonfruit');
  });

  it('every seed has a distinct name in each language', () => {
    for (const locale of ['en', 'fr'] as const) {
      const names = seedFoods.map((s) => seedName(s, locale).toLowerCase());
      expect(new Set(names).size).toBe(seedFoods.length);
    }
  });
});
