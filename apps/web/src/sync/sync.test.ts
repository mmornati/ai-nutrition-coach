import {
  createDrainSyncQueue,
  createRecordPlate,
  createRecordSyncOp,
  syncOp,
  type CoachNoteGenerator,
  type EncryptedStore,
  type FoodEntryDraft,
  type SyncOp,
  type SyncQueueState,
  databaseFood,
  plateLog,
  recordPlateSuccess,
  storeFailure,
  type RecordPlateResult,
} from '@anc/core';
import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../storage/key-value-store';
import { DirtyFlagSyncQueue, VAULT_OP_ID } from './relay/dirty-queue';
import { localOnlySyncAdapter } from './local-only-sync-adapter';

const op = (opId: string, plateLogId = 1): SyncOp =>
  syncOp({ opId, plateLogId, enqueuedAtUtc: 1, kind: 'plateLogCreated' });

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** The encrypted `kv`, in memory. */
function memoryKv(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    read: (key) => Promise.resolve(data.get(key) ?? null),
    write: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

const connectedQueue = async (kv = memoryKv()) => {
  const queue = new DirtyFlagSyncQueue(kv, () => 5);
  await queue.load(true);
  return { queue, kv };
};

function watchState(q: DirtyFlagSyncQueue): { seen: SyncQueueState[]; stop: () => void } {
  const seen: SyncQueueState[] = [];
  const stop = q.watchState({ next: (v) => void seen.push(v), error: () => undefined });
  return { seen, stop };
}

describe('DirtyFlagSyncQueue', () => {
  it('counts nothing while the device is not connected to a vault', async () => {
    const queue = new DirtyFlagSyncQueue(memoryKv());
    await queue.load(false);
    await queue.enqueue(op('a'));
    queue.markDirty();
    expect(queue.dirty).toBe(false);
    expect(await queue.pending()).toEqual([]);
  });

  it('a write sets one persisted flag; pending() is one synthetic vault op', async () => {
    const { queue, kv } = await connectedQueue();
    expect((await queue.enqueue(op('a'))).kind).toBe('enqueued');
    expect((await queue.enqueue(op('b'))).kind).toBe('alreadyEnqueued');
    expect((await queue.pending()).map((o) => o.opId)).toEqual([VAULT_OP_ID]);
    await tick();
    expect(kv.data.get('sync.dirty')).toBe('1');
  });

  it('the flag survives a lock: a new queue over the same store reads it back', async () => {
    const { queue, kv } = await connectedQueue();
    queue.markDirty();
    await tick();
    const next = new DirtyFlagSyncQueue(kv);
    await next.load(true);
    expect(next.dirty).toBe(true);
    // ...and it is not carried into a device that is not connected.
    const other = new DirtyFlagSyncQueue(kv);
    await other.load(false);
    expect(other.dirty).toBe(false);
  });

  it('is cleared only by an acknowledgement of a push that started after the last write', async () => {
    const { queue, kv } = await connectedQueue();
    queue.markDirty();
    const started = queue.generation;
    queue.markDirty(); // a write lands while the push is in flight
    queue.acknowledge(started);
    expect((await queue.markSynced(VAULT_OP_ID)).kind).toBe('marked');
    expect(queue.dirty).toBe(true);
    queue.acknowledge(queue.generation);
    await queue.markSynced(VAULT_OP_ID);
    expect(queue.dirty).toBe(false);
    await tick();
    expect(kv.data.has('sync.dirty')).toBe(false);
  });

  it('a failed push leaves the flag set; an unknown op is a typed failure', async () => {
    const { queue } = await connectedQueue();
    queue.markDirty();
    await queue.markFailed(VAULT_OP_ID, 'offline');
    expect(queue.dirty).toBe(true);
    expect(await queue.markSynced('zzz')).toEqual({ kind: 'markFailed', reason: 'unknown opId' });
    expect((await queue.markFailed('zzz', 'r')).kind).toBe('markFailed');
  });

  it('leaving the vault forgets the flag', async () => {
    const { queue, kv } = await connectedQueue();
    queue.markDirty();
    queue.setConnected(false);
    expect(queue.dirty).toBe(false);
    await tick();
    expect(kv.data.has('sync.dirty')).toBe(false);
  });

  it('watchState emits the current value once asynchronously, then on every change', async () => {
    const { queue } = await connectedQueue();
    const w = watchState(queue);
    expect(w.seen).toEqual([]);
    await tick();
    expect(w.seen).toEqual([{ pending: 0, synced: 0, failed: 0 }]);
    queue.markDirty();
    expect(w.seen.at(-1)).toEqual({ pending: 1, synced: 0, failed: 0 });
    expect(Object.isFrozen(w.seen.at(-1))).toBe(true);
    w.stop();
    w.stop();
    queue.setConnected(false);
    expect(w.seen.at(-1)).toEqual({ pending: 1, synced: 0, failed: 0 });
  });

  it('never claims a plate is synced: the per-plate view is always empty', async () => {
    const { queue } = await connectedQueue();
    const seen: (readonly unknown[])[] = [];
    queue.watchPerPlate({ next: (v) => void seen.push(v), error: () => undefined });
    queue.markDirty();
    await tick();
    expect(seen).toEqual([[]]);
  });

  it('a throwing observer does not break the queue or other observers', async () => {
    const { queue } = await connectedQueue();
    queue.watchState({
      next: () => {
        throw new Error('bad observer');
      },
      error: () => undefined,
    });
    const w = watchState(queue);
    await tick();
    await expect(queue.enqueue(op('a'))).resolves.toEqual({ kind: 'enqueued' });
    expect(w.seen.at(-1)?.pending).toBe(1);
  });

  it('dispose stops every subscription', async () => {
    const { queue } = await connectedQueue();
    const w = watchState(queue);
    await tick();
    queue.dispose();
    queue.markDirty();
    expect(w.seen).toHaveLength(1);
  });
});

describe('LocalOnlySyncAdapter', () => {
  it('has no transport and never reports drained', async () => {
    expect(localOnlySyncAdapter.hasTransport).toBe(false);
    expect(await localOnlySyncAdapter.drain(op('a'))).toEqual({ kind: 'drainSkippedNoTransport' });
  });

  it('a drain pass with no transport leaves the flag set', async () => {
    const { queue } = await connectedQueue();
    await queue.enqueue(op('a'));
    const summary = await createDrainSyncQueue({ queue, adapter: localOnlySyncAdapter })();
    expect(summary.noTransport).toBe(true);
    expect(summary.drained).toBe(0);
    expect(queue.dirty).toBe(true);
  });
});

// Port of the earlier client: the local commit lands first; the enqueue is a separate
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

  it('marks the vault changed after a successful local commit', async () => {
    const { queue } = await connectedQueue();
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
    expect((await queue.pending()).map((o) => o.opId)).toEqual([VAULT_OP_ID]);
  });

  it('does not mark anything when the local commit fails', async () => {
    const { queue } = await connectedQueue();
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
