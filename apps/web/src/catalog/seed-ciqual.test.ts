import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidGrams } from '@anc/core';
import type { CiqualTable } from './ciqual';
import { CiqualIndex } from './ciqual-index';
import { ciqualPresets, offPresets, seedPresets } from './food-display';
import { seedFoods } from './seed-foods';

const table = JSON.parse(
  readFileSync(join(__dirname, '../../public/catalog/ciqual-2025.json'), 'utf8'),
) as CiqualTable;
const index = CiqualIndex.fromTable(table);

describe('seed foods and CIQUAL', () => {
  it('every seed names a CIQUAL food that has an energy value', () => {
    for (const seed of seedFoods) {
      expect(seed.ciqual, seed.id).toBeDefined();
      const entry = index.byCode(seed.ciqual!);
      expect(entry, `${seed.id} -> ${seed.ciqual}`).toBeDefined();
      expect(entry!.nutrients.energyKcal, seed.id).toBeGreaterThan(0);
    }
  });

  it('maps no two seeds onto the same food', () => {
    expect(new Set(seedFoods.map((s) => s.ciqual)).size).toBe(seedFoods.length);
  });

  it('gives every preset plausible grams, in step with its size', () => {
    for (const seed of seedFoods) {
      for (const preset of seed.presets) {
        expect(isValidGrams(preset.grams), `${seed.id} ${preset.unit}`).toBe(true);
      }
      const [first, second] = seed.presets;
      if (first && second && first.high < second.low) {
        expect(first.grams!).toBeLessThan(second.grams!);
      }
    }
  });

  it('presets carry grams flagged as estimates', () => {
    const rice = seedFoods.find((s) => s.id === 'rice')!;
    expect(seedPresets(rice, 'en').map((q) => [q.displayLabel, q.grams, q.gramsEstimated])).toEqual(
      [
        ['~1 cup', 150, true],
        ['~2 cups', 300, true],
      ],
    );
  });
});

describe('gram presets', () => {
  it('a CIQUAL food gets its sub-group portions and always "100 g"', () => {
    const fruit = ciqualPresets('0204', 'en');
    expect(fruit.map((q) => [q.displayLabel, q.grams, q.gramsEstimated])).toEqual([
      ['1 portion', 150, true],
      ['100 g', 100, false],
    ]);
    expect(ciqualPresets('0201', 'fr').map((q) => q.displayLabel)).toEqual([
      'Petite portion',
      'Grande portion',
      '100 g',
    ]);
    expect(ciqualPresets(undefined, 'en').map((q) => q.grams)).toEqual([100]);
    expect(ciqualPresets('9999', 'en').map((q) => q.grams)).toEqual([100]);
  });

  it('follows the table of typical portions', () => {
    const grams = (sub: string): number[] => ciqualPresets(sub, 'en').map((q) => q.grams!);
    expect(grams('0204')).toEqual([150, 100]); // fruit
    expect(grams('0201')).toEqual([100, 200, 100]); // vegetables
    expect(grams('0301')).toEqual([150, 250, 100]); // cooked starch
    expect(grams('0401')).toEqual([100, 150, 100]); // meat
    expect(grams('0503')).toEqual([30, 100]); // cheese
    expect(grams('0502')).toEqual([125, 100]); // yogurt
    expect(grams('0501')).toEqual([250, 100]); // milk
    expect(grams('0302')).toEqual([40, 100]); // bread
    expect(grams('0602')).toEqual([250, 100]); // drinks
    expect(grams('0902')).toEqual([10, 100]); // oils
    expect(grams('0701')).toEqual([20, 100]); // sugar
    expect(grams('0103')).toEqual([300, 100]); // composite dishes
  });

  it('all are plain gram quantities (low = high = grams, unit g)', () => {
    for (const q of ciqualPresets('0103', 'en')) {
      expect(q).toMatchObject({ unit: 'g', low: q.grams, high: q.grams });
    }
  });

  it('an OFF product gets serving, 100 g and pack in grams', () => {
    expect(
      offPresets({ servingGrams: 27.5, packGrams: 400 }, 'fr').map((q) => [
        q.displayLabel,
        q.grams,
      ]),
    ).toEqual([
      ['1 portion', 27.5],
      ['100 g', 100],
      ['Paquet entier', 400],
    ]);
    expect(offPresets({}, 'en').map((q) => q.displayLabel)).toEqual(['100 g']);
    expect(offPresets({ packGrams: 30, servingGrams: 30 }, 'en').map((q) => q.grams)).toEqual([
      30, 100,
    ]);
  });
});
