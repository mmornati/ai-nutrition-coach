import { describe, expect, it } from 'vitest';
import {
  catalogFailure,
  databaseFood,
  foodGroupLabel,
  FOOD_GROUPS,
  notFound,
  plateLog,
  rankedMatches,
  transcribedText,
  transcriptionFailure,
  type FoodCatalog,
  type FoodMatch,
} from '../src/index';
import { q, utc } from './helpers';

describe('FoodCatalog port contract', () => {
  it('rankedMatches / notFound / catalogFailure are the union members', () => {
    expect([rankedMatches([]), notFound(''), catalogFailure('unknown')].map((r) => r.kind)).toEqual(
      ['rankedMatches', 'notFound', 'catalogFailure'],
    );
  });

  it('FoodMatch carries food + confidence + presets', () => {
    const match: FoodMatch = {
      food: databaseFood({
        sourceRef: 'seed:apple',
        displayName: 'Apple',
        source: 'manual',
        foodGroup: 'vegFruit',
      }),
      confidence: 0.9,
      presets: [{ low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece' }],
    };
    expect(match.food.displayName).toBe('Apple');
    expect(match.confidence).toBe(0.9);
    expect(match.presets[0]?.unit).toBe('piece');
  });

  it('CatalogResult equality: same shape compares equal', () => {
    expect(rankedMatches([])).toEqual(rankedMatches([]));
  });

  it('an adapter without barcode support answers with a typed failure instead of throwing', async () => {
    const catalog: FoodCatalog = {
      search: () => Promise.resolve(rankedMatches([])),
      lookupBySourceRef: () => Promise.resolve(null),
      lookupByBarcode: () => Promise.resolve(catalogFailure('barcodeUnsupported')),
    };
    await expect(catalog.lookupByBarcode('3017620422003')).resolves.toEqual(
      catalogFailure('barcodeUnsupported'),
    );
  });
});

describe('VoiceTranscriber port contract', () => {
  it('TranscribeResult is a union: transcribedText | transcriptionFailure', () => {
    expect(transcribedText('apple').kind).toBe('transcribedText');
    expect(transcriptionFailure('unsupportedInV1').kind).toBe('transcriptionFailure');
  });

  it('transcriptionFailure carries a typed reason', () => {
    const f = transcriptionFailure('microphoneDenied');
    expect(f.kind === 'transcriptionFailure' && f.reason).toBe('microphoneDenied');
  });
});

describe('DatabaseFood foodGroup field', () => {
  it('defaults to other', () => {
    expect(databaseFood({ sourceRef: 'x', displayName: 'X', source: 'manual' }).foodGroup).toBe(
      'other',
    );
  });

  it('explicit foodGroup participates in equality', () => {
    const mk = (foodGroup: 'vegFruit' | 'other') =>
      databaseFood({ sourceRef: 'seed:apple', displayName: 'Apple', source: 'manual', foodGroup });
    expect(mk('vegFruit')).toEqual(mk('vegFruit'));
    expect(mk('vegFruit')).not.toEqual(mk('other'));
  });

  it('FoodGroup labels are stable across the arc rendering', () => {
    expect(FOOD_GROUPS.map(foodGroupLabel)).toEqual([
      'Veg & Fruit',
      'Protein',
      'Starch',
      'Dairy',
      'Other',
    ]);
  });

  it('sourceRef is kept byte-for-byte (no trimming or case folding)', () => {
    const ref = '  0737628064502 é/A ';
    expect(databaseFood({ sourceRef: ref, displayName: 'x', source: 'off' }).sourceRef).toBe(ref);
  });
});

describe('PlateLog', () => {
  it('copies entries into an immutable list', () => {
    const entries = [
      {
        id: 1,
        plateLogId: 1,
        databaseFood: databaseFood({ sourceRef: 'a', displayName: 'A', source: 'seed' }),
        quantity: q(),
      },
    ];
    const plate = plateLog({ id: 1, loggedAtUtc: utc(2026), entries });
    entries.push(entries[0] as (typeof entries)[number]);
    expect(plate.entries).toHaveLength(1);
    expect(() => (plate.entries as unknown[]).push(1)).toThrow(TypeError);
  });
});
