// Port of the failed-store behaviour: when the database cannot be opened the UI gets typed, calm
// failures (the REAL one) and nothing is ever written.
import { storeFailure } from '@anc/core';
import { describe, expect, it } from 'vitest';
import { FailedCoachNoteStore, FailedEncryptedStore } from './failed-store';

const failure = storeFailure('secureKey');

describe('FailedEncryptedStore', () => {
  const store = new FailedEncryptedStore(failure);

  it('refuses every operation with the real failure', async () => {
    expect(await store.recordPlate()).toBe(failure);
    expect(await store.readRange()).toEqual({ kind: 'platesReadFailed', failure });
    expect(await store.deletePlate()).toEqual({ kind: 'plateDeleteFailed', failure });
    await store.close();
  });

  it('a watcher gets the typed failure on the error channel, once, and can unsubscribe', async () => {
    const errors: unknown[] = [];
    const stop = store.watchRange(
      {},
      { next: () => errors.push('value?!'), error: (f) => errors.push(f) },
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    stop();
    expect(errors).toEqual([failure]);
    const cancelled: unknown[] = [];
    store.watchRange({}, { next: () => undefined, error: (f) => cancelled.push(f) })();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(cancelled).toEqual([]);
  });
});

describe('FailedCoachNoteStore', () => {
  const notes = new FailedCoachNoteStore(failure);

  it('writes nothing and answers typed failures; reads are empty', async () => {
    const note = {
      id: 0,
      plateLogId: 1,
      anchor: 'postResolve' as const,
      questionKey: 'q',
      text: 't',
      generatedAt: 0,
    };
    expect(await notes.append(note)).toEqual({ kind: 'coachNoteAppendFailure', cause: failure });
    expect(await notes.recordDismissal()).toEqual({
      kind: 'coachInteractionFailed',
      cause: failure,
    });
    expect(await notes.recordInteraction()).toEqual({
      kind: 'coachInteractionFailed',
      cause: failure,
    });
    expect(await notes.deleteForPlate()).toEqual({ kind: 'plateDeleteFailed', failure });
    expect(await notes.forPlate()).toEqual([]);
  });

  it('watchers emit the empty value, never an error', async () => {
    const seen: unknown[] = [];
    notes.watchForPlate(1, { next: (v) => seen.push(v), error: () => seen.push('error') });
    notes.watchDismissals({ next: (v) => seen.push(v), error: () => seen.push('error') });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(seen).toEqual([[], new Set()]);
  });
});
