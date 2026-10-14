import { describe, expect, it } from 'vitest';
import {
  allPlates,
  classifyForDate,
  dayBoardSlot,
  isSlotOpen,
  localDayRange,
  localTime,
  MEAL_SLOTS,
  platesInRange,
  visibleSlots,
} from '../src/index';
import { plateWith } from './helpers';

const day = localTime(2026, 8, 15, 14);
const at = (id: number, h: number, mi = 0, d = 15) =>
  plateWith(id, [{ group: 'protein', name: 'x' }], localTime(2026, 8, d, h, mi));

describe('classifyForDate (Day Board slots)', () => {
  it('buckets plates by local hour, one bucket per slot in declaration order', () => {
    const board = classifyForDate([at(1, 8), at(2, 12), at(3, 19)], day);
    expect(board.slots.map((s) => s.slot)).toEqual([...MEAL_SLOTS]);
    expect(dayBoardSlot(board, 'breakfast').plates.map((p) => p.id)).toEqual([1]);
    expect(dayBoardSlot(board, 'lunch').plates.map((p) => p.id)).toEqual([2]);
    expect(dayBoardSlot(board, 'dinner').plates.map((p) => p.id)).toEqual([3]);
    expect(isSlotOpen(dayBoardSlot(board, 'late'))).toBe(true);
    expect(board.date).toBe(localTime(2026, 8, 15));
  });

  it('a slot holds ALL its plates in time order (a second lunch does not hide the first)', () => {
    const board = classifyForDate([at(2, 13, 30), at(1, 11, 5), at(3, 12)], day);
    expect(dayBoardSlot(board, 'lunch').plates.map((p) => p.id)).toEqual([1, 3, 2]);
  });

  it('23:00-04:59 are kept in the late slot, early hours before late ones', () => {
    const board = classifyForDate([at(1, 23, 15), at(2, 0, 30), at(3, 4, 59)], day);
    expect(dayBoardSlot(board, 'late').plates.map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it('late is hidden when empty and shown when it holds a plate', () => {
    expect(visibleSlots(classifyForDate([at(1, 8)], day)).map((s) => s.slot)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
    ]);
    expect(visibleSlots(classifyForDate([at(1, 23)], day)).map((s) => s.slot)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'late',
    ]);
  });

  it('plates outside the local day are ignored (half-open at both ends)', () => {
    const before = plateWith(1, [], localTime(2026, 8, 14, 23, 59, 59, 999));
    const first = plateWith(2, [], localTime(2026, 8, 15, 0, 0));
    const last = plateWith(3, [], localTime(2026, 8, 15, 23, 59, 59, 999));
    const after = plateWith(4, [], localTime(2026, 8, 16, 0, 0));
    const board = classifyForDate([before, first, last, after], day);
    expect(allPlates(board).map((p) => p.id)).toEqual([2, 3]);
  });

  it('allPlates is oldest first across slots', () => {
    const board = classifyForDate([at(3, 19), at(1, 8), at(2, 12)], day);
    expect(allPlates(board).map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('is immutable', () => {
    const board = classifyForDate([at(1, 8)], day);
    expect(Object.isFrozen(board.slots)).toBe(true);
    expect(Object.isFrozen(dayBoardSlot(board, 'breakfast').plates)).toBe(true);
  });

  it('agrees with the store-style range filter on the same day', () => {
    const { from, to } = localDayRange(day);
    const plates = [at(1, 8), at(2, 23, 59), at(3, 9, 0, 16)];
    const viaRange = platesInRange(plates, { from, to }).map((p) => p.id);
    expect(
      allPlates(classifyForDate(plates, day))
        .map((p) => p.id)
        .sort(),
    ).toEqual([...viaRange].sort());
  });

  it('localDayRange is the half-open [midnight, next midnight)', () => {
    expect(localDayRange(day)).toEqual({
      from: localTime(2026, 8, 15),
      to: localTime(2026, 8, 16),
    });
  });
});
