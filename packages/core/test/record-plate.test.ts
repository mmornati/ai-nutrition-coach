import { describe, expect, it } from 'vitest';
import {
  createCoachNoteGenerator,
  createRecordPlate,
  databaseFood,
  plateLog,
  recordPlateSuccess,
  storeFailure,
  type FoodEntryDraft,
  type RecordPlateResult,
} from '../src/index';
import { FakeCoach, FakeCoachNoteStore, FakeStore, q, utc } from './helpers';

// The earlier stubs threw "not used" on any call: the empty-entries / failure paths must never
// reach the coach or note store.
const untouchedCoach = {
  questionFor: () => {
    throw new Error('not used');
  },
};
const generator = createCoachNoteGenerator({
  coach: untouchedCoach,
  store: new FakeCoachNoteStore(),
});
const useCase = createRecordPlate({ generator });

const apple: FoodEntryDraft = {
  databaseFood: databaseFood({ sourceRef: 'manual:apple', displayName: 'Apple', source: 'manual' }),
  quantity: { low: 1, high: 2, unit: 'piece', displayLabel: '~1–2 pieces' },
};
const zero: FoodEntryDraft = {
  databaseFood: databaseFood({ sourceRef: 'x', displayName: 'X', source: 'manual' }),
  quantity: { low: 0, high: 0, unit: 'g', displayLabel: '~0 g' },
};

describe('RecordPlate use-case', () => {
  it('happy path: delegates to the store with entries + loggedAtUtc', async () => {
    const committedAt = utc(2026, 8, 15, 12);
    const expected = recordPlateSuccess(
      plateLog({
        id: 7,
        loggedAtUtc: committedAt,
        entries: [
          { id: 11, plateLogId: 7, databaseFood: apple.databaseFood, quantity: apple.quantity },
        ],
      }),
    );
    const store = new FakeStore(expected);
    // Coach untouched on this path would throw, but the generator absorbs it as coachEmpty.
    const result = await useCase({ entries: [apple], store, loggedAtUtc: committedAt });
    expect(result).toEqual(expected);
    expect(store.calls).toBe(1);
    expect(store.lastEntries).toEqual([apple]);
    expect(store.lastLoggedAtUtc).toBe(committedAt);
  });

  it('empty entries: returns emptyPlate and never calls the store', async () => {
    const store = new FakeStore();
    const result = await useCase({ entries: [], store });
    expect(result).toEqual(storeFailure('emptyPlate'));
    expect(store.calls).toBe(0);
  });

  it('store failure (unsupportedPlatform) propagates typed', async () => {
    const failure = storeFailure('unsupportedPlatform');
    const result = await useCase({ entries: [zero], store: new FakeStore(failure) });
    expect(result).toEqual(failure);
  });

  it('store failure (secureKey) propagates typed', async () => {
    const failure = storeFailure('secureKey');
    const result = await useCase({ entries: [zero], store: new FakeStore(failure) });
    expect(result).toEqual(failure);
  });

  it('refuses an invalid quantity before the store, at runtime', async () => {
    const store = new FakeStore();
    for (const bad of [q(Number.NaN, 1), q(3, 1), q(-1, 1), q(0, Number.POSITIVE_INFINITY)]) {
      const result: RecordPlateResult = await useCase({
        entries: [{ ...apple, quantity: bad }],
        store,
      });
      expect(result).toEqual(storeFailure('invalidQuantity'));
    }
    expect(store.calls).toBe(0);
  });

  it('a committed plate is returned untouched when nothing needs warning', async () => {
    const coach = new FakeCoach();
    const ok = createRecordPlate({
      generator: createCoachNoteGenerator({ coach, store: new FakeCoachNoteStore() }),
    });
    const result = await ok({ entries: [apple], store: new FakeStore() });
    expect(result.kind).toBe('recordPlateSuccess');
    expect(result.kind === 'recordPlateSuccess' && result.warnings).toEqual([]);
  });
});
