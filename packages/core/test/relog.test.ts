import { describe, expect, it } from 'vitest';
import {
  copyDrafts,
  databaseFood,
  instantForSlot,
  localTime,
  planDayCopy,
  slotsAvailable,
  plateLog,
  type FoodEntry,
} from '../src/index';

function entry(id: number, plateId: number, name: string): FoodEntry {
  return {
    id,
    plateLogId: plateId,
    databaseFood: databaseFood({
      sourceRef: `seed:${name}`,
      displayName: name,
      source: 'seed',
      foodGroup: 'protein',
      nutrientsPer100g: { energyKcal: 120, protein: 20 },
      extra: { nutrientsEstimated: true },
    }),
    quantity: { low: 1, high: 2, unit: 'fist', displayLabel: '~1–2 fists', grams: 150 },
  };
}

describe('copyDrafts', () => {
  it('keeps the food snapshot, nutrients and quantity, drops ids and shares nothing', () => {
    const source = entry(7, 3, 'salmon');
    const [copy] = copyDrafts([source]);
    expect(copy).toEqual({ databaseFood: source.databaseFood, quantity: source.quantity });
    expect(copy).not.toHaveProperty('id');
    expect(copy?.databaseFood).not.toBe(source.databaseFood);
    expect(copy?.databaseFood.nutrientsPer100g).not.toBe(source.databaseFood.nutrientsPer100g);
    expect(copy?.quantity).not.toBe(source.quantity);
  });
});

describe('instantForSlot', () => {
  const now = localTime(2026, 10, 21, 13, 40);
  const today = localTime(2026, 10, 21);

  it('is right now for the meal now falls in, on today', () => {
    expect(instantForSlot({ day: today, slot: 'lunch', now })).toBe(now);
  });

  it('is the slot typical hour for another meal today', () => {
    expect(instantForSlot({ day: today, slot: 'breakfast', now })).toBe(localTime(2026, 10, 21, 8));
    expect(instantForSlot({ day: today, slot: 'dinner', now })).toBe(localTime(2026, 10, 21, 19));
    expect(instantForSlot({ day: today, slot: 'late', now })).toBe(localTime(2026, 10, 21, 23));
  });

  it('is the slot typical hour on another day, even for the meal now falls in', () => {
    const earlier = localTime(2026, 10, 19);
    expect(instantForSlot({ day: earlier, slot: 'lunch', now })).toBe(localTime(2026, 10, 19, 12));
  });
});

describe('planDayCopy', () => {
  const target = localTime(2026, 10, 21);
  const dinner = plateLog({
    id: 3,
    loggedAtUtc: localTime(2026, 10, 19, 19, 30),
    entries: [entry(31, 3, 'soup')],
  });
  const breakfast = plateLog({
    id: 1,
    loggedAtUtc: localTime(2026, 10, 19, 7, 45),
    entries: [entry(11, 1, 'oats'), entry(12, 1, 'milk')],
  });
  const lunch = plateLog({
    id: 2,
    loggedAtUtc: localTime(2026, 10, 19, 12, 10),
    entries: [entry(21, 2, 'rice')],
  });
  const empty = plateLog({ id: 4, loggedAtUtc: localTime(2026, 10, 19, 16), entries: [] });

  it('keeps slot order and each plate clock time, on the target day', () => {
    const plan = planDayCopy([dinner, empty, breakfast, lunch], target);
    expect(
      plan.map((p) => [p.sourcePlateId, p.slot, new Date(p.loggedAtUtc).toISOString()]),
    ).toEqual([
      [1, 'breakfast', new Date(localTime(2026, 10, 21, 7, 45)).toISOString()],
      [2, 'lunch', new Date(localTime(2026, 10, 21, 12, 10)).toISOString()],
      [3, 'dinner', new Date(localTime(2026, 10, 21, 19, 30)).toISOString()],
    ]);
  });

  it('copies every entry as a fresh draft and skips plates without entries', () => {
    const plan = planDayCopy([breakfast, empty], target);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.entries.map((e) => e.databaseFood.displayName)).toEqual(['oats', 'milk']);
  });

  it('is empty for a day with nothing on it', () => {
    expect(planDayCopy([], target)).toEqual([]);
  });
});

describe('planDayCopy: order and the future', () => {
  const target = localTime(2026, 10, 21);
  const mk = (id: number, h: number, m = 0) =>
    plateLog({
      id,
      loggedAtUtc: localTime(2026, 10, 19, h, m),
      entries: [entry(id * 10, id, `f${id}`)],
    });

  it('orders by clock time only: a 01:00 late plate comes before the 19:30 dinner', () => {
    const plan = planDayCopy([mk(1, 19, 30), mk(2, 1, 0), mk(3, 12)], target);
    expect(plan.map((p) => [p.sourcePlateId, p.slot])).toEqual([
      [2, 'late'],
      [3, 'lunch'],
      [1, 'dinner'],
    ]);
  });

  it('marks plates whose time is after now as later, and leaves the rest alone', () => {
    const now = localTime(2026, 10, 21, 13, 0);
    const plan = planDayCopy([mk(1, 7, 45), mk(2, 12, 59), mk(3, 13, 0), mk(4, 19)], target, now);
    expect(plan.map((p) => [p.sourcePlateId, p.later])).toEqual([
      [1, false],
      [2, false],
      [3, false],
      [4, true],
    ]);
    // Without a "now" nothing is later.
    expect(planDayCopy([mk(4, 19)], target).every((p) => !p.later)).toBe(true);
  });
});

describe('slotsAvailable', () => {
  const today = localTime(2026, 10, 21);
  const all = ['breakfast', 'lunch', 'dinner', 'late'] as const;

  it('on today offers only the meals that have started', () => {
    expect(
      slotsAvailable({ day: today, now: localTime(2026, 10, 21, 13, 40), candidates: all }),
    ).toEqual(['breakfast', 'lunch']);
    expect(
      slotsAvailable({ day: today, now: localTime(2026, 10, 21, 23, 30), candidates: all }),
    ).toEqual(['breakfast', 'lunch', 'dinner', 'late']);
  });

  it('after midnight only the late meal has started, and it lands at now', () => {
    expect(
      slotsAvailable({ day: today, now: localTime(2026, 10, 21, 2, 0), candidates: all }),
    ).toEqual(['late']);
  });

  it('on another day every candidate is offered', () => {
    const earlier = localTime(2026, 10, 19);
    expect(
      slotsAvailable({
        day: earlier,
        now: localTime(2026, 10, 21, 9, 0),
        candidates: all.slice(0, 3),
      }),
    ).toEqual(['breakfast', 'lunch', 'dinner']);
  });
});
