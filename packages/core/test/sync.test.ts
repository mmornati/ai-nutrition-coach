import { describe, expect, it } from 'vitest';
import {
  createRecordSyncOp,
  parseSyncOpStatus,
  rollupPlateStatus,
  syncOp,
  syncOpEquals,
  syncQueueTotal,
  type SyncOpStatusValue,
} from '../src/index';
import { FakeQueue, utc } from './helpers';

describe('SyncOp', () => {
  const op = syncOp({
    opId: 'a',
    plateLogId: 1,
    enqueuedAtUtc: utc(2026),
    kind: 'plateLogCreated',
  });

  it('payload defaults to an empty object', () => {
    expect(op.payload).toEqual({});
  });

  it('equality is by the (opId, plateLogId, kind) triple, not by timestamp or payload', () => {
    expect(syncOpEquals(op, { ...op, enqueuedAtUtc: utc(2027), payload: { x: 1 } })).toBe(true);
    expect(syncOpEquals(op, { ...op, opId: 'b' })).toBe(false);
    expect(syncOpEquals(op, { ...op, plateLogId: 2 })).toBe(false);
    expect(syncOpEquals(op, { ...op, kind: 'plateLogDeleted' })).toBe(false);
  });
});

describe('SyncQueueState + per-plate status', () => {
  it('total sums the three counts', () => {
    expect(syncQueueTotal({ pending: 1, synced: 2, failed: 3 })).toBe(6);
  });

  it('parseSyncOpStatus reads unknown values as pending', () => {
    expect(parseSyncOpStatus('synced')).toBe('synced');
    expect(parseSyncOpStatus('failed')).toBe('failed');
    expect(parseSyncOpStatus('pending')).toBe('pending');
    expect(parseSyncOpStatus('???')).toBe('pending');
  });

  it.each<[SyncOpStatusValue[], SyncOpStatusValue | null]>([
    [['synced', 'synced'], 'synced'],
    [['synced', 'pending'], 'pending'],
    [['failed', 'pending'], 'pending'],
    [['pending', 'failed', 'synced'], 'pending'],
    [['synced', 'failed'], 'failed'],
    [['failed'], 'failed'],
    [[], null],
    [['synced', 'failed', 'synced'], 'failed'],
  ])(
    'rollup of %j is %s (any pending wins, then failed shows as retry-later)',
    (statuses, expected) => {
      expect(rollupPlateStatus(statuses)).toBe(expected);
    },
  );
});

describe('RecordSyncOp', () => {
  it('delegates to the queue enqueue', async () => {
    const queue = new FakeQueue();
    const op = syncOp({ opId: 'a', plateLogId: 1, enqueuedAtUtc: 1, kind: 'plateLogCreated' });
    expect(await createRecordSyncOp(queue)(op)).toEqual({ kind: 'enqueued' });
    expect(queue.ops).toEqual([op]);
  });
});
