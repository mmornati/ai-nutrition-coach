import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  databaseFood,
  gramsQuantity,
  type CatalogResult,
  type FoodCatalog,
  type RecognitionResult,
} from '@anc/core';
import type { CiqualTable } from '../catalog/ciqual';
import { OfflineFirstFoodCatalog } from '../catalog/offline-first-catalog';
import { enrichRecognition, namesAgree } from './closest-matches';

const table = JSON.parse(
  readFileSync(join(__dirname, '../../public/catalog/ciqual-2025.json'), 'utf8'),
) as CiqualTable;
const catalog = new OfflineFirstFoodCatalog({
  onlineLookupAllowed: async () => false,
  locale: () => 'en',
  ciqual: async () => table,
});

const plate = (...names: string[]): RecognitionResult => ({
  kind: 'recognizedPlate',
  foods: names.map((n) => ({
    databaseFood: databaseFood({ sourceRef: `ai:${n}`, displayName: n, source: 'manual' }),
    confidence: 0.8,
    quantity: gramsQuantity(180, { estimated: true }),
  })),
});
const foods = (r: RecognitionResult) => (r.kind === 'recognizedPlate' ? r.foods : []);

describe('namesAgree', () => {
  it('needs every recognised word in the match (accents, plurals, prefixes aside)', () => {
    expect(namesAgree('Rice', 'Rice, white, cooked')).toBe(true);
    expect(namesAgree('Œufs', 'Oeuf dur')).toBe(true);
    expect(namesAgree('apple pie', 'Apple')).toBe(false);
    expect(namesAgree('', 'Apple')).toBe(false);
  });
});

describe('enrichRecognition', () => {
  it('attaches the confident match nutrients and keeps the food and the model grams', async () => {
    const out = foods(await enrichRecognition(plate('Rice'), catalog))[0]!;
    expect(out.databaseFood).toMatchObject({ sourceRef: 'ai:Rice', displayName: 'Rice' });
    expect(out.databaseFood.nutrientsPer100g?.energyKcal).toBe(155);
    expect(out.quantity.grams).toBe(180);
  });

  it('leaves nutrients unknown without a confident match', async () => {
    const out = foods(await enrichRecognition(plate('Zorblax stew', 'Apple pie zzz'), catalog));
    for (const f of out) expect(f.databaseFood.nutrientsPer100g).toBeUndefined();
  });

  it('does not override nutrients that came from a database, and ignores non-plates', async () => {
    const own = databaseFood({
      sourceRef: 'x',
      displayName: 'Rice',
      source: 'manual',
      nutrientsPer100g: { energyKcal: 1 },
    });
    const rec: RecognitionResult = {
      kind: 'recognizedPlate',
      foods: [{ databaseFood: own, confidence: 1, quantity: gramsQuantity(100) }],
    };
    expect(foods(await enrichRecognition(rec, catalog))[0]!.databaseFood).toBe(own);
    const failure: RecognitionResult = { kind: 'recognitionFailure', reason: 'unknown' } as never;
    expect(await enrichRecognition(failure, catalog)).toBe(failure);
  });

  it('a confident match REPLACES the model values and drops the estimate flag', async () => {
    const modelFood = databaseFood({
      sourceRef: 'byok-m-Rice',
      displayName: 'Rice',
      source: 'manual',
      nutrientsPer100g: { energyKcal: 999, protein: 40 },
      extra: { nutrientsEstimated: true },
    });
    const rec: RecognitionResult = {
      kind: 'recognizedPlate',
      foods: [{ databaseFood: modelFood, confidence: 0.9, quantity: gramsQuantity(180) }],
    };
    const out = foods(await enrichRecognition(rec, catalog))[0]!.databaseFood;
    expect(out.nutrientsPer100g?.energyKcal).toBe(155);
    expect(out.nutrientsPer100g?.protein).toBe(3.15);
    expect(out.extra?.nutrientsEstimated).toBeUndefined();
    expect(out.sourceRef).toBe('byok-m-Rice');
  });

  it('keeps the model values, flagged as estimates, when no match is confident', async () => {
    const modelFood = databaseFood({
      sourceRef: 'byok-m-Zorblax',
      displayName: 'Zorblax stew',
      source: 'manual',
      nutrientsPer100g: { energyKcal: 120 },
      extra: { nutrientsEstimated: true },
    });
    const rec: RecognitionResult = {
      kind: 'recognizedPlate',
      foods: [{ databaseFood: modelFood, confidence: 0.9, quantity: gramsQuantity(180) }],
    };
    const out = foods(await enrichRecognition(rec, catalog))[0]!;
    expect(out.databaseFood).toBe(modelFood);
    expect(out.databaseFood.extra?.nutrientsEstimated).toBe(true);
  });

  it('considers every candidate: a weak first hit does not hide a confident later one', async () => {
    const weak = databaseFood({
      sourceRef: 'a',
      displayName: 'Rice pudding',
      source: 'ciqual',
      nutrientsPer100g: { energyKcal: 1 },
    });
    const good = databaseFood({
      sourceRef: 'b',
      displayName: 'Rice',
      source: 'ciqual',
      nutrientsPer100g: { energyKcal: 130 },
    });
    const stub: FoodCatalog = {
      search: async () => ({
        kind: 'rankedMatches',
        matches: [
          { food: weak, confidence: 0.3, presets: [] },
          { food: good, confidence: 0.7, presets: [] },
        ],
      }),
      lookupBySourceRef: async () => null,
      lookupByBarcode: async () => ({ kind: 'notFound', query: '' }),
    };
    const out = foods(await enrichRecognition(plate('Rice'), stub))[0]!;
    expect(out.databaseFood.nutrientsPer100g?.energyKcal).toBe(130);
  });

  it('survives a catalogue that fails or throws', async () => {
    const result = (r: CatalogResult): FoodCatalog => ({
      search: async () => r,
      lookupBySourceRef: async () => null,
      lookupByBarcode: async () => r,
    });
    const throwing: FoodCatalog = {
      ...result({ kind: 'notFound', query: '' }),
      search: async () => {
        throw new Error('boom');
      },
    };
    for (const c of [result({ kind: 'catalogFailure', reason: 'unknown' }), throwing]) {
      const out = foods(await enrichRecognition(plate('Rice'), c))[0]!;
      expect(out.databaseFood.nutrientsPer100g).toBeUndefined();
    }
  });
});
