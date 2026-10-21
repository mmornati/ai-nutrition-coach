import { describe, expect, it } from 'vitest';
import {
  databaseFood,
  foodUses,
  frequentFoods,
  localTime,
  plateLog,
  recentFoods,
  type PlateLog,
  type QuantityRange,
} from '../src/index';

const grams = (g: number): QuantityRange => ({
  low: g,
  high: g,
  unit: 'g',
  displayLabel: `${g} g`,
  grams: g,
});

let nextId = 1;
function plate(at: number, foods: readonly (readonly [string, number])[]): PlateLog {
  const id = nextId++;
  return plateLog({
    id,
    loggedAtUtc: at,
    entries: foods.map(([name, g], i) => ({
      id: id * 100 + i,
      plateLogId: id,
      databaseFood: databaseFood({
        sourceRef: `manual:${name}`,
        displayName: name,
        source: 'manual',
      }),
      quantity: grams(g),
    })),
  });
}

const NOW = localTime(2026, 10, 21, 20);
const day = (offset: number, hour = 12): number => localTime(2026, 10, 21 + offset, hour);

describe('recentFoods', () => {
  it('lists distinct foods, newest first, each with its last quantity', () => {
    const plates = [
      plate(day(-3), [['Rice', 150]]),
      plate(day(-1), [
        ['Rice', 200],
        ['Egg', 60],
      ]),
      plate(day(-2), [['Apple', 120]]),
    ];
    const recent = recentFoods(plates);
    // Rice and Egg share a plate (same instant): the tie is broken by name.
    expect(recent.map((u) => u.food.displayName)).toEqual(['Egg', 'Rice', 'Apple']);
    expect(recent[1]?.quantity.grams).toBe(200);
    expect(recent[1]?.count).toBe(2);
  });

  it('does not depend on the order of the input', () => {
    const a = plate(day(-3), [['Rice', 150]]);
    const b = plate(day(-1), [['Rice', 200]]);
    expect(recentFoods([a, b])[0]?.quantity.grams).toBe(200);
    expect(recentFoods([b, a])[0]?.quantity.grams).toBe(200);
  });

  it('caps at ten and treats a food twice on one plate as one use', () => {
    const many = Array.from({ length: 14 }, (_, i) => plate(day(-i), [[`Food ${i}`, 100]]));
    expect(recentFoods(many)).toHaveLength(10);
    const twice = foodUses([
      plate(day(0), [
        ['Tea', 200],
        ['Tea', 250],
      ]),
    ]);
    expect(twice).toHaveLength(1);
    expect(twice[0]?.count).toBe(1);
    expect(twice[0]?.quantity.grams).toBe(250);
  });

  it('is empty for no plates, and a limit of zero gives nothing', () => {
    expect(recentFoods([])).toEqual([]);
    expect(recentFoods([plate(day(0), [['Tea', 200]])], 0)).toEqual([]);
  });

  it('keeps foods of different catalogs apart even with the same reference', () => {
    const p = plateLog({
      id: 99,
      loggedAtUtc: day(0),
      entries: (['seed', 'off'] as const).map((source, i) => ({
        id: i + 1,
        plateLogId: 99,
        databaseFood: databaseFood({ sourceRef: 'x', displayName: source, source }),
        quantity: grams(10),
      })),
    });
    expect(foodUses([p])).toHaveLength(2);
  });
});

describe('frequentFoods', () => {
  it('ranks by how many plates held the food over the last 30 days', () => {
    const plates = [
      plate(day(-1), [
        ['Rice', 150],
        ['Egg', 60],
      ]),
      plate(day(-2), [
        ['Rice', 150],
        ['Egg', 60],
      ]),
      plate(day(-3), [['Rice', 150]]),
      plate(day(-4), [['Apple', 100]]),
    ];
    const often = frequentFoods(plates, { now: NOW });
    expect(often.map((u) => [u.food.displayName, u.count])).toEqual([
      ['Rice', 3],
      ['Egg', 2],
    ]);
  });

  it('leaves out one-offs and anything older than the window', () => {
    const plates = [
      plate(day(-40), [['Soup', 300]]),
      plate(day(-35), [['Soup', 300]]),
      plate(day(-29), [['Bread', 40]]),
      plate(day(-2), [['Bread', 40]]),
    ];
    const often = frequentFoods(plates, { now: NOW });
    expect(often.map((u) => u.food.displayName)).toEqual(['Bread']);
    // 30 days: today and the 29 before it; the 30th day back is out.
    const edge = [plate(day(-30), [['Jam', 20]]), plate(day(-29), [['Jam', 20]])];
    expect(frequentFoods(edge, { now: NOW })).toEqual([]);
  });

  it('breaks a tie by recency, then by name, and honours limit and minCount', () => {
    const plates = [
      plate(day(-5), [['Beta', 1]]),
      plate(day(-6), [['Beta', 1]]),
      plate(day(-2), [['Alpha', 1]]),
      plate(day(-3), [['Alpha', 1]]),
      plate(day(-2, 13), [['Gamma', 1]]),
      plate(day(-3, 13), [['Gamma', 1]]),
    ];
    const all = frequentFoods(plates, { now: NOW });
    expect(all.map((u) => u.food.displayName)).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(frequentFoods(plates, { now: NOW, limit: 1 })).toHaveLength(1);
    expect(frequentFoods(plates, { now: NOW, minCount: 3 })).toEqual([]);
  });
});
