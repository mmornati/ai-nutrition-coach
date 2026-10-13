import { describe, expect, it } from 'vitest';
import {
  databaseFood,
  NO_MATCH,
  quotaExhausted,
  recognitionFailure,
  recognizedPlate,
  type AiRung,
  type RecognitionResult,
  type RecognizedFood,
} from '../src/index';
import { utc } from './helpers';

const apple: RecognizedFood = {
  databaseFood: databaseFood({
    sourceRef: 'seed:apple',
    displayName: 'Apple',
    source: 'manual',
    foodGroup: 'vegFruit',
  }),
  confidence: 0.85,
  quantity: { low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece' },
};

describe('AiRung port contract', () => {
  it('RecognitionResult is a union: recognizedPlate | noMatch | recognitionFailure | quotaExhausted', () => {
    const all: RecognitionResult[] = [
      recognizedPlate([]),
      NO_MATCH,
      recognitionFailure('network'),
      quotaExhausted(),
    ];
    expect(all.map((r) => r.kind)).toEqual([
      'recognizedPlate',
      'noMatch',
      'recognitionFailure',
      'quotaExhausted',
    ]);
  });

  it('quotaExhausted carries an optional resetAt timestamp', () => {
    const noReset = quotaExhausted();
    const reset = quotaExhausted(utc(2026, 8, 17));
    expect(noReset.kind === 'quotaExhausted' && noReset.resetAt).toBeUndefined();
    expect(reset.kind === 'quotaExhausted' && reset.resetAt).toBe(utc(2026, 8, 17));
    expect('resetAt' in noReset).toBe(false);
  });

  it('quotaExhausted equality: same resetAt compares equal', () => {
    expect(quotaExhausted(utc(2026, 8, 17))).toEqual(quotaExhausted(utc(2026, 8, 17)));
    expect(quotaExhausted(utc(2026, 8, 17))).not.toEqual(quotaExhausted(utc(2026, 8, 18)));
  });

  it('quotaExhausted is distinct from recognitionFailure: the UI routes them differently', () => {
    expect(quotaExhausted()).not.toEqual(recognitionFailure('keyRejected'));
    expect(quotaExhausted().kind).not.toBe('recognitionFailure');
  });

  it('RecognizedFood carries food + confidence + quantity', () => {
    expect(apple.databaseFood.displayName).toBe('Apple');
    expect(apple.confidence).toBe(0.85);
    expect(apple.quantity.unit).toBe('piece');
  });

  it('recognizedPlate equality: same shape compares equal', () => {
    expect(recognizedPlate([])).toEqual(recognizedPlate([]));
  });

  it('recognizedPlate with non-empty foods: equality', () => {
    expect(recognizedPlate([apple])).toEqual(recognizedPlate([apple]));
  });

  it('adapter conformance: a minimal adapter returning the empty recognition shape (AD-5)', async () => {
    const rung: AiRung = { recognize: () => Promise.resolve(recognizedPlate([])) };
    const result = await rung.recognize(new Uint8Array(0));
    expect(result.kind).toBe('recognizedPlate');
    // An empty recognised plate is not a failure.
    expect(result.kind === 'recognizedPlate' && result.foods).toEqual([]);
  });
});
