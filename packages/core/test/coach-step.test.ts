import { describe, expect, it } from 'vitest';
import {
  databaseFood,
  gramsQuantity,
  isSyncedKvKey,
  isValidKvValue,
  parseStep,
  plateLog,
  reviewStep,
  serializeStep,
  stepOfferFor,
  STEP_IDS,
  type FoodGroup,
  type PlateLog,
} from '../src/index';

const at = (day: number, h = 12) => new Date(2026, 9, day, h).getTime();
function plate(
  id: number,
  when: number,
  items: readonly { name: string; group?: FoodGroup }[],
): PlateLog {
  return plateLog({
    id,
    loggedAtUtc: when,
    entries: items.map((it, i) => ({
      id: i + 1,
      plateLogId: id,
      databaseFood: databaseFood({
        sourceRef: `t:${it.name}`,
        displayName: it.name,
        source: 'manual',
        foodGroup: it.group ?? 'other',
        nutrientsPer100g: it.name === 'Cola' ? { sugars: 10 } : undefined,
      }),
      quantity: gramsQuantity(150),
    })),
  });
}

describe('the stored step', () => {
  it('round-trips and is validated for the vault', () => {
    const text = serializeStep({ id: 'vegAtLunch', at: at(10) });
    expect(parseStep(text)).toEqual({ id: 'vegAtLunch', at: at(10) });
    expect(isSyncedKvKey('coach.step')).toBe(true);
    expect(isValidKvValue('coach.step', text)).toBe(true);
    const food = serializeStep({ id: 'smallerPortion', at: at(10), food: 'Pizza' });
    expect(parseStep(food)).toMatchObject({ food: 'Pizza' });
  });

  it.each([
    '',
    'null',
    '[]',
    '{"id":"nope","at":"2026-10-10T10:00:00.000Z"}',
    '{"id":"vegAtLunch","at":"yesterday"}',
    '{"id":"vegAtLunch","at":"2026-10-10T10:00:00.000Z","extra":1}',
    `{"id":"smallerPortion","at":"2026-10-10T10:00:00.000Z","food":"${'x'.repeat(41)}"}`,
  ])('refuses %s', (text) => {
    expect(parseStep(text)).toBeNull();
    expect(isValidKvValue('coach.step', text)).toBe(false);
  });

  it('every id is a distinct, stable token', () => {
    expect(new Set(STEP_IDS).size).toBe(STEP_IDS.length);
  });
});

describe('the step a shown suggestion can offer', () => {
  it('chooses from the suggestion and the meal', () => {
    expect(stepOfferFor('vegLight', 'lunch')).toEqual({ id: 'vegAtLunch' });
    expect(stepOfferFor('vegLight', 'dinner')).toEqual({ id: 'vegAtDinner' });
    expect(stepOfferFor('sugaryDrink', 'dinner')).toEqual({ id: 'waterForDrinks' });
    expect(stepOfferFor('energyHighDay', 'dinner', { food: 'Pizza' })).toEqual({
      id: 'smallerPortion',
      food: 'Pizza',
    });
    expect(stepOfferFor('proteinMissingDay', 'breakfast')).toEqual({ id: 'proteinAtBreakfast' });
  });
  it('a gentle "eat enough" line is never a task', () => {
    expect(stepOfferFor('energyLowDay', 'dinner')).toBeNull();
    expect(stepOfferFor('balanced', 'lunch')).toBeNull();
  });
});

describe('what the logged meals show about the step', () => {
  const step = { id: 'vegAtLunch', at: at(10, 9) } as const;
  const today = at(16, 9);

  it('counts the lunches with veg, descriptively', () => {
    const plates = [
      ...[10, 11, 12, 13].map((d, i) =>
        plate(i + 1, at(d), [{ name: 'Salad', group: 'vegFruit' }]),
      ),
      plate(5, at(14), [{ name: 'Rice', group: 'starch' }]),
      plate(6, at(15), [{ name: 'Pasta', group: 'starch' }]),
      plate(7, at(14, 19), [{ name: 'Soup', group: 'vegFruit' }]),
    ];
    expect(reviewStep({ step, plates, today })).toEqual({
      id: 'vegAtLunch',
      kind: 'meals',
      matched: 4,
      of: 6,
    });
  });

  it('days before the step was accepted are not counted; too little logged says nothing', () => {
    const plates = [
      plate(1, at(5), [{ name: 'Salad', group: 'vegFruit' }]),
      plate(2, at(11), [{ name: 'Rice', group: 'starch' }]),
    ];
    expect(reviewStep({ step, plates, today })).toBeNull();
  });

  it('the drinks step counts days with a sugary drink', () => {
    const plates = [
      plate(1, at(10), [{ name: 'Cola' }]),
      plate(2, at(11), [{ name: 'Water' }]),
      plate(3, at(12), [{ name: 'Water' }]),
    ];
    expect(reviewStep({ step: { id: 'waterForDrinks', at: at(10, 9) }, plates, today })).toEqual({
      id: 'waterForDrinks',
      kind: 'days',
      matched: 1,
      of: 3,
    });
  });

  it('a step the data cannot show is not checked', () => {
    expect(
      reviewStep({ step: { id: 'smallerPortion', at: at(10), food: 'Pizza' }, plates: [], today }),
    ).toBeNull();
  });
});
