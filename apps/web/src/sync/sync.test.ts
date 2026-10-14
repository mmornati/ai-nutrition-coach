import {
  createDrainSyncQueue,
  createRecordPlate,
  createRecordSyncOp,
  syncOp,
  type CoachNoteGenerator,
  type EncryptedStore,
  type FoodEntryDraft,
  type SyncOp,
  type SyncOpStatus,
  type SyncQueueState,
  databaseFood,
  plateLog,
  recordPlateSuccess,
  storeFailure,
  type RecordPlateResult,
} from '@anc/core';
import { describe, expect, it } from 'vitest';
import { InMemorySyncQueue } from './in-memory-sync-queue';
import { localOnlySyncAdapter } from './local-only-sync-adapter';

const op = (opId: string, plateLogId = 1): SyncOp =>
  syncOp({ opId, plateLogId, enqueuedAtUtc: 1, kind: 'plateLogCreated' });

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function watchState(q: InMemorySyncQueue): { seen: SyncQueueState[]; stop: () => void } {
  const seen: SyncQueueState[] = [];
  const stop = q.watchState({ next: (v) => void seen.push(v), error: () => undefined });
  return { seen, stop };
}
function watchPlates(q: InMemorySyncQueue): {
  seen: (readonly SyncOpStatus[])[];
  stop: () => void;
} {
  const seen: (readonly SyncOpStatus[])[] = [];
  const stop = q.watchPerPlate({ next: (v) => void seen.push(v), error: () => undefined });
  return { seen, stop };
}

describe('InMemorySyncQueue', () => {
  it('enqueue is idempotent on opId', async () => {
    const q = new InMemorySyncQueue();
    expect((await q.enqueue(op('a'))).kind).toBe('enqueued');
    expect((await q.enqueue(op('a'))).kind).toBe('alreadyEnqueued');
    expect(await q.pending()).toHaveLength(1);
  });

  it('pending is oldest first, honours the limit and skips non-pending', async () => {
    const q = new InMemorySyncQueue();
    for (const id of ['a', 'b', 'c']) await q.enqueue(op(id, 1));
    await q.markSynced('a');
    expect((await q.pending()).map((o) => o.opId)).toEqual(['b', 'c']);
    expect((await q.pending({ limit: 1 })).map((o) => o.opId)).toEqual(['b']);
  });

  it('watchState emits the current value once asynchronously, then on every change', async () => {
    const q = new InMemorySyncQueue();
    const w = watchState(q);
    expect(w.seen).toEqual([]);
    await tick();
    expect(w.seen).toEqual([{ pending: 0, synced: 0, failed: 0 }]);
    await q.enqueue(op('a'));
    await q.markFailed('a', 'nope');
    expect(w.seen.at(-1)).toEqual({ pending: 0, synced: 0, failed: 1 });
    expect(Object.isFrozen(w.seen.at(-1))).toBe(true);
    w.stop();
  });

  it('a change before the first emission is covered by it (no stale initial value)', async () => {
    const q = new InMemorySyncQueue();
    const w = watchState(q);
    await q.enqueue(op('a'));
    await tick();
    expect(w.seen).toEqual([{ pending: 1, synced: 0, failed: 0 }]);
  });

  it('unsubscribe stops delivery, and is safe twice', async () => {
    const q = new InMemorySyncQueue();
    const w = watchState(q);
    await tick();
    w.stop();
    w.stop();
    await q.enqueue(op('a'));
    expect(w.seen).toHaveLength(1);
  });

  it('a throwing observer does not break the queue or other observers', async () => {
    const q = new InMemorySyncQueue();
    q.watchState({
      next: () => {
        throw new Error('bad observer');
      },
      error: () => undefined,
    });
    const w = watchState(q);
    await tick();
    await expect(q.enqueue(op('a'))).resolves.toEqual({ kind: 'enqueued' });
    expect(w.seen.at(-1)?.pending).toBe(1);
  });

  it('per-plate view: only plates with ops appear, any pending wins, then failed', async () => {
    const q = new InMemorySyncQueue();
    const w = watchPlates(q);
    await tick();
    expect(w.seen.at(-1)).toEqual([]);
    await q.enqueue(op('a', 1));
    await q.enqueue(op('b', 1));
    await q.enqueue(op('c', 2));
    await q.markSynced('a');
    expect(w.seen.at(-1)).toEqual([
      { plateLogId: 1, status: 'pending' },
      { plateLogId: 2, status: 'pending' },
    ]);
    await q.markFailed('b', 'x');
    await q.markSynced('c');
    expect(w.seen.at(-1)).toEqual([
      { plateLogId: 1, status: 'failed' },
      { plateLogId: 2, status: 'synced' },
    ]);
  });

  it('marking an unknown opId is a typed failure', async () => {
    const q = new InMemorySyncQueue();
    expect(await q.markSynced('zzz')).toEqual({ kind: 'markFailed', reason: 'unknown opId' });
    expect((await q.markFailed('zzz', 'r')).kind).toBe('markFailed');
  });

  it('dispose stops every subscription', async () => {
    const q = new InMemorySyncQueue();
    const w = watchState(q);
    await tick();
    q.dispose();
    await q.enqueue(op('a'));
    expect(w.seen).toHaveLength(1);
  });
});

describe('LocalOnlySyncAdapter', () => {
  it('has no transport and never reports drained', async () => {
    expect(localOnlySyncAdapter.hasTransport).toBe(false);
    expect(await localOnlySyncAdapter.drain(op('a'))).toEqual({ kind: 'drainSkippedNoTransport' });
  });

  it('a drain pass over the in-memory queue leaves every op pending', async () => {
    const queue = new InMemorySyncQueue();
    await queue.enqueue(op('a'));
    const summary = await createDrainSyncQueue({ queue, adapter: localOnlySyncAdapter })();
    expect(summary.noTransport).toBe(true);
    expect(summary.drained).toBe(0);
    expect((await queue.pending()).map((o) => o.opId)).toEqual(['a']);
  });
});

// Port of record_plate_sync_op_test.dart: the local commit lands first; the enqueue is a separate
// best-effort write after it.
describe('RecordPlate + RecordSyncOp', () => {
  const draftEntry: FoodEntryDraft = {
    databaseFood: databaseFood({ sourceRef: 'seed-1', displayName: 'apple', source: 'manual' }),
    quantity: { low: 1, high: 1, unit: 'piece', displayLabel: '1 piece' },
  };
  const generator: CoachNoteGenerator = {
    generateFor: () => Promise.resolve({ kind: 'noCoachNoteGenerated', reason: 'noPattern' }),
  } as unknown as CoachNoteGenerator;
  const storeReturning = (result: RecordPlateResult): EncryptedStore =>
    ({ recordPlate: () => Promise.resolve(result) }) as unknown as EncryptedStore;

  it('enqueues after a successful local commit', async () => {
    const queue = new InMemorySyncQueue();
    const record = createRecordPlate({ generator, syncOpEnqueue: createRecordSyncOp(queue) });
    const committed = plateLog({ id: 42, loggedAtUtc: Date.UTC(2026, 7, 16), entries: [] });
    const result = await record({
      entries: [draftEntry],
      store: storeReturning(recordPlateSuccess(committed)),
    });
    expect(result.kind).toBe('recordPlateSuccess');
    const watch = watchState(queue);
    await tick();
    expect(watch.seen[0]).toEqual({ pending: 1, synced: 0, failed: 0 });
    const [queued] = await queue.pending();
    expect(queued?.plateLogId).toBe(42);
    expect(queued?.kind).toBe('plateLogCreated');
  });

  it('does not enqueue when the local commit fails', async () => {
    const queue = new InMemorySyncQueue();
    const record = createRecordPlate({ generator, syncOpEnqueue: createRecordSyncOp(queue) });
    const result = await record({
      entries: [draftEntry],
      store: storeReturning(storeFailure('storeOperation')),
    });
    expect(result.kind).toBe('storeFailure');
    const watch = watchState(queue);
    await tick();
    expect(watch.seen[0]).toEqual({ pending: 0, synced: 0, failed: 0 });
  });
});
