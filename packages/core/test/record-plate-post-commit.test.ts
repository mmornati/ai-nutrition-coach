import { describe, expect, it } from 'vitest';
import {
  createCoachNoteGenerator,
  createRecordPlate,
  createRecordSyncOp,
  databaseFood,
  plateLog,
  storeFailure,
  type FoodGroup,
  type PostCommitWarning,
} from '../src/index';
import {
  constantCoach,
  draft,
  FakeCoachNoteStore,
  FakeQueue,
  FakeStore,
  q,
  question,
  utc,
} from './helpers';

const coach = constantCoach(question('postResolve', 'vegLight', 'hello'));

function useCase(
  notes: FakeCoachNoteStore,
  queue: FakeQueue,
  extra: Partial<Parameters<typeof createRecordPlate>[0]> = {},
) {
  return createRecordPlate({
    generator: createCoachNoteGenerator({ coach, store: notes }),
    syncOpEnqueue: createRecordSyncOp(queue),
    ...extra,
  });
}

const success = (r: { kind: string }) => {
  expect(r.kind).toBe('recordPlateSuccess');
  return r as { kind: 'recordPlateSuccess'; warnings: readonly PostCommitWarning[] };
};

describe('post-commit guards (F7)', () => {
  it('clean run: success with no warnings, note + op written', async () => {
    const notes = new FakeCoachNoteStore();
    const queue = new FakeQueue();
    const result = await useCase(notes, queue)({ entries: [draft()], store: new FakeStore() });
    expect(success(result).warnings).toEqual([]);
    expect(notes.appended).toHaveLength(1);
    expect(queue.ops).toHaveLength(1);
  });

  it('a THROWING coach store is a success with a coachNote warning', async () => {
    const notes = new FakeCoachNoteStore();
    notes.mode = 'throw';
    const result = await useCase(
      notes,
      new FakeQueue(),
    )({ entries: [draft()], store: new FakeStore() });
    expect(success(result).warnings).toEqual([{ step: 'coachNote' }]);
  });

  it('a typed note-append failure is a coachNote warning', async () => {
    const notes = new FakeCoachNoteStore();
    notes.mode = 'fail';
    const result = await useCase(
      notes,
      new FakeQueue(),
    )({ entries: [draft()], store: new FakeStore() });
    expect(success(result).warnings).toEqual([{ step: 'coachNote' }]);
  });

  it('a THROWING queue is a success with a syncEnqueue warning', async () => {
    const result = await useCase(
      new FakeCoachNoteStore(),
      new FakeQueue({ throws: true }),
    )({
      entries: [draft()],
      store: new FakeStore(),
    });
    expect(success(result).warnings).toEqual([{ step: 'syncEnqueue' }]);
  });

  it('both steps failing yields both warnings, still success', async () => {
    const notes = new FakeCoachNoteStore();
    notes.mode = 'throw';
    const result = await useCase(
      notes,
      new FakeQueue({ fails: true }),
    )({
      entries: [draft()],
      store: new FakeStore(),
    });
    expect(success(result).warnings.map((w) => w.step)).toEqual(['coachNote', 'syncEnqueue']);
  });

  it('a plate with no resolvable group is NOT a warning (nothing to say)', async () => {
    const result = await useCase(
      new FakeCoachNoteStore(),
      new FakeQueue(),
    )({
      entries: [draft('other' satisfies FoodGroup)],
      store: new FakeStore(),
    });
    expect(success(result).warnings).toEqual([]);
  });

  it('the plate is committed before any post-commit step runs', async () => {
    const order: string[] = [];
    const store = new FakeStore();
    const original = store.recordPlate.bind(store);
    store.recordPlate = async (input) => {
      order.push('commit');
      return original(input);
    };
    const queue = new FakeQueue();
    const enqueue = queue.enqueue.bind(queue);
    queue.enqueue = (op) => {
      order.push('enqueue');
      return enqueue(op);
    };
    await useCase(new FakeCoachNoteStore(), queue)({ entries: [draft()], store });
    expect(order).toEqual(['commit', 'enqueue']);
  });

  it('a failed commit runs no post-commit step', async () => {
    const notes = new FakeCoachNoteStore();
    const queue = new FakeQueue();
    const result = await useCase(
      notes,
      queue,
    )({
      entries: [draft()],
      store: new FakeStore(storeFailure('keyLost')),
    });
    expect(result).toEqual(storeFailure('keyLost'));
    expect(notes.appended).toEqual([]);
    expect(queue.ops).toEqual([]);
  });
});

describe('every throw is absorbed; warnings reach the sink', () => {
  // The Dart version let an `Error` (a programming bug) propagate and absorbed only `Exception`s.
  // JavaScript has no such split, and the contract is that a committed plate is never reported
  // as a failure (the user would log it twice), so everything thrown becomes a warning.
  it('a non-Error throw from a post-commit step is a warning, not a failure', async () => {
    const notes = new FakeCoachNoteStore();
    notes.append = () => {
      throw new TypeError('bug');
    };
    const result = await createRecordPlate({
      generator: createCoachNoteGenerator({ coach, store: notes }),
    })({ entries: [draft()], store: new FakeStore() });
    expect(success(result).warnings).toEqual([{ step: 'coachNote' }]);
  });

  it('onWarning is told about every warning', async () => {
    const seen: PostCommitWarning[] = [];
    const notes = new FakeCoachNoteStore();
    notes.mode = 'throw';
    await useCase(notes, new FakeQueue({ fails: true }), { onWarning: (w) => seen.push(w) })({
      entries: [draft()],
      store: new FakeStore(),
    });
    expect(seen.map((w) => w.step)).toEqual(['coachNote', 'syncEnqueue']);
  });

  it('a throwing sink cannot undo a committed plate', async () => {
    const notes = new FakeCoachNoteStore();
    notes.mode = 'throw';
    const result = await createRecordPlate({
      generator: createCoachNoteGenerator({ coach, store: notes }),
      onWarning: () => {
        throw new Error('sink down');
      },
    })({ entries: [draft()], store: new FakeStore() });
    expect(result.kind).toBe('recordPlateSuccess');
  });
});

describe('op ids (F4)', () => {
  it('ops carry a random UUID v4, not a plate-derived id', async () => {
    const queue = new FakeQueue();
    const run = useCase(new FakeCoachNoteStore(), queue);
    await run({ entries: [draft()], store: new FakeStore() });
    await run({ entries: [draft()], store: new FakeStore() });
    const ids = queue.ops.map((o) => o.opId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(id.startsWith('plate-')).toBe(false);
    }
  });

  it('an injected generator is used, and the op is enqueued at the plate time', async () => {
    const queue = new FakeQueue();
    await useCase(new FakeCoachNoteStore(), queue, { opIdGenerator: () => 'fixed-id' })({
      entries: [draft()],
      store: new FakeStore(),
    });
    expect(queue.ops[0]).toMatchObject({
      opId: 'fixed-id',
      plateLogId: 5,
      kind: 'plateLogCreated',
      enqueuedAtUtc: utc(2026, 8, 16, 12),
    });
  });
});

describe('quantity validation (F10)', () => {
  it('PlateLog.entries is unmodifiable', () => {
    const plate = plateLog({ id: 1, loggedAtUtc: utc(2026), entries: [] });
    expect(() =>
      (plate.entries as unknown[]).push({
        id: 1,
        plateLogId: 1,
        databaseFood: databaseFood({ sourceRef: 'x', displayName: 'X', source: 'manual' }),
        quantity: q(),
      }),
    ).toThrow(TypeError);
  });
});
