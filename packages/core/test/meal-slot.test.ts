import { describe, expect, it } from 'vitest';
import { isMealSlotAlwaysShown, MEAL_SLOTS, mealSlotForHour, type MealSlot } from '../src/index';

describe('meal slots', () => {
  it('declares breakfast, lunch, dinner, late in order', () => {
    expect(MEAL_SLOTS).toEqual(['breakfast', 'lunch', 'dinner', 'late']);
  });

  it('breakfast 05-10, lunch 11-15, dinner 16-22, late 23-04', () => {
    const expected: Record<number, MealSlot> = {};
    for (let h = 5; h <= 10; h++) expected[h] = 'breakfast';
    for (let h = 11; h <= 15; h++) expected[h] = 'lunch';
    for (let h = 16; h <= 22; h++) expected[h] = 'dinner';
    for (const h of [23, 0, 1, 2, 3, 4]) expected[h] = 'late';
    for (let h = 0; h < 24; h++) expect(mealSlotForHour(h), `hour ${h}`).toBe(expected[h]);
  });

  it('every hour maps to exactly one slot (total)', () => {
    const counts = new Map<MealSlot, number>();
    for (let h = 0; h < 24; h++) {
      const slot = mealSlotForHour(h);
      counts.set(slot, (counts.get(slot) ?? 0) + 1);
    }
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(24);
    expect(Object.fromEntries(counts)).toEqual({ breakfast: 6, lunch: 5, dinner: 7, late: 6 });
  });

  it('boundaries: 04:59 is late, 05:00 breakfast, 10 -> 11 lunch, 15 -> 16 dinner, 22 -> 23 late', () => {
    expect([4, 5, 10, 11, 15, 16, 22, 23].map(mealSlotForHour)).toEqual([
      'late',
      'breakfast',
      'breakfast',
      'lunch',
      'lunch',
      'dinner',
      'dinner',
      'late',
    ]);
  });

  it('out-of-range hours wrap rather than throw', () => {
    expect(mealSlotForHour(24)).toBe('late');
    expect(mealSlotForHour(29)).toBe('breakfast');
    expect(mealSlotForHour(-1)).toBe('late');
    expect(mealSlotForHour(12.9)).toBe('lunch');
  });

  it('late renders only when it holds a plate; the three meals always render', () => {
    expect(MEAL_SLOTS.filter(isMealSlotAlwaysShown)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(isMealSlotAlwaysShown('late')).toBe(false);
  });
});
