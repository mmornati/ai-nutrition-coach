import { describe, expect, it } from 'vitest';
import {
  createCoachNoteGenerator,
  createRecordPlate,
  createReplacePlate,
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

describe('ReplacePlate use-case (editing a logged plate)', () => {
  const replace = createReplacePlate({ generator });
  const at = utc(2026, 8, 15, 19);

  it('hands the edited entries and time to the store, then generates a note for the NEW plate', async () => {
    const coach = new FakeCoach();
    const notes = new FakeCoachNoteStore();
    const withNotes = createReplacePlate({
      generator: createCoachNoteGenerator({ coach, store: notes }),
    });
    const store = new FakeStore();
    const result = await withNotes({ plateLogId: 5, entries: [apple], loggedAtUtc: at, store });
    expect(result.kind).toBe('recordPlateSuccess');
    expect(store.lastReplace).toEqual({ plateLogId: 5, loggedAtUtc: at });
    expect(store.lastEntries).toEqual([apple]);
    // The coach was asked about the edited plate (id 105 in the fake), not the old one (5).
    expect(result.kind === 'recordPlateSuccess' && result.plateLog.id).toBe(105);
  });

  it('refuses an empty plate and an invalid quantity before the store', async () => {
    const store = new FakeStore();
    expect(await replace({ plateLogId: 5, entries: [], loggedAtUtc: at, store })).toEqual(
      storeFailure('emptyPlate'),
    );
    expect(
      await replace({
        plateLogId: 5,
        entries: [{ ...apple, quantity: q(3, 1) }],
        loggedAtUtc: at,
        store,
      }),
    ).toEqual(storeFailure('invalidQuantity'));
    expect(store.lastReplace).toBeUndefined();
  });

  it('a store failure propagates typed', async () => {
    const failure: RecordPlateResult = storeFailure('storeOperation');
    expect(
      await replace({
        plateLogId: 5,
        entries: [apple],
        loggedAtUtc: at,
        store: new FakeStore(failure),
      }),
    ).toEqual(failure);
  });
});

describe('a plate is never logged after now', () => {
  const now = utc(2026, 8, 15, 12);
  const clock = () => now;
  const replace = createReplacePlate({ generator, clock });
  const record = createRecordPlate({ generator, clock });

  it('replacePlate refuses an instant after now with a typed failure, before the store', async () => {
    const store = new FakeStore();
    const result = await replace({
      plateLogId: 5,
      entries: [apple],
      loggedAtUtc: now + 1,
      store,
    });
    expect(result).toEqual(storeFailure('futureTime'));
    expect(store.lastReplace).toBeUndefined();
    const ok = await replace({ plateLogId: 5, entries: [apple], loggedAtUtc: now, store });
    expect(ok.kind).toBe('recordPlateSuccess');
  });

  it('recordPlate refuses an instant after now; an omitted instant is left to the store', async () => {
    const store = new FakeStore();
    expect(await record({ entries: [apple], loggedAtUtc: now + 60_000, store })).toEqual(
      storeFailure('futureTime'),
    );
    expect((await record({ entries: [apple], store })).kind).toBe('recordPlateSuccess');
  });
});
