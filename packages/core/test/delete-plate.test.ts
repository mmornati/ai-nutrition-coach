import { describe, expect, it } from 'vitest';
import {
  createDeletePlate,
  PLATE_DELETED,
  plateDeleteFailed,
  storeFailure,
  type DeletePlateResult,
} from '../src/index';
import { FakeCoachNoteStore, FakeStore } from './helpers';

const failure = storeFailure('storeOperation');

function wire(plateResult: DeletePlateResult, notesResult: DeletePlateResult, notesThrow = false) {
  const log: string[] = [];
  const store = new FakeStore();
  store.deletePlate = () => {
    log.push('plate');
    return Promise.resolve(plateResult);
  };
  const notes = new FakeCoachNoteStore();
  notes.deleteForPlate = () => {
    log.push('notes');
    return notesThrow ? Promise.reject(new Error('boom')) : Promise.resolve(notesResult);
  };
  return { log, run: createDeletePlate({ store, coachNotes: notes }) };
}

describe('DeletePlate', () => {
  it('deletes the plate (with its cascade) first, then the coach notes', async () => {
    const { log, run } = wire(PLATE_DELETED, PLATE_DELETED);
    expect(await run(7)).toEqual(PLATE_DELETED);
    expect(log).toEqual(['plate', 'notes']);
  });

  it('a failed plate delete stops before the notes step', async () => {
    const { log, run } = wire(plateDeleteFailed(failure), PLATE_DELETED);
    expect(await run(7)).toEqual(plateDeleteFailed(failure));
    expect(log).toEqual(['plate']);
  });

  it('a failed notes cascade is reported', async () => {
    const { run } = wire(PLATE_DELETED, plateDeleteFailed(failure));
    expect((await run(7)).kind).toBe('plateDeleteFailed');
  });

  it('an adapter that throws is collapsed to a typed failure', async () => {
    const { log, run } = wire(PLATE_DELETED, PLATE_DELETED, true);
    expect(await run(7)).toEqual(plateDeleteFailed(storeFailure('storeOperation')));
    expect(log).toEqual(['plate', 'notes']);
  });

  it('a throwing plate store also collapses and skips the notes step', async () => {
    const log: string[] = [];
    const store = new FakeStore();
    store.deletePlate = () => Promise.reject(new Error('db'));
    const notes = new FakeCoachNoteStore();
    notes.deleteForPlate = () => {
      log.push('notes');
      return Promise.resolve(PLATE_DELETED);
    };
    const result = await createDeletePlate({ store, coachNotes: notes })(1);
    expect(result.kind).toBe('plateDeleteFailed');
    expect(log).toEqual([]);
  });
});
