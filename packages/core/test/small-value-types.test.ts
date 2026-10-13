// UUID v4, balance coverage, food-group parsing, platesInRange, DrainSyncQueue and the
// QuantityRange factory (security review F2 / F4 / F9).
import { describe, expect, it, vi } from 'vitest';
import {
  balanceCoverage,
  createDrainSyncQueue,
  DRAIN_SKIPPED_NO_TRANSPORT,
  DRAINED,
  drainFailedPermanent,
  markFailed,
  drainFailedRetryable,
  foodGroupFromStored,
  generateUuidV4,
  parseFoodGroup,
  platesInRange,
  quantityRange,
  secureRandomBytes,
  updateQuantityRange,
  type DrainResult,
  type SyncAdapter,
  type SyncOp,
} from '../src/index';
import { FakeQueue, utc } from './helpers';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A small deterministic generator (mulberry32) so seeded output is reproducible. */
function seeded(seed: number) {
  let a = seed;
  return (length: number): Uint8Array => {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      out[i] = (((t ^ (t >>> 14)) >>> 0) % 256) & 0xff;
    }
    return out;
  };
}

describe('QuantityRange factory (validates at runtime, not assert-only)', () => {
  it('accepts a valid range', () => {
    const r = quantityRange({ low: 1, high: 2, unit: 'cup', displayLabel: '~1-2 cups' });
    expect(r.ok && r.value.high).toBe(2);
  });

  it.each([
    [-1, 1],
    [2, 1],
    [Number.NaN, 1],
    [0, Number.POSITIVE_INFINITY],
  ])('rejects %s..%s with a typed error, without throwing', (low, high) => {
    const r = quantityRange({ low, high, unit: 'x', displayLabel: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalidQuantityRange');
  });

  it('updateQuantityRange cannot produce an invalid range', () => {
    const base = { low: 1, high: 2, unit: 'x', displayLabel: 'x' };
    expect(updateQuantityRange(base, { low: 5 }).ok).toBe(false);
    expect(updateQuantityRange(base, { high: 5 }).ok).toBe(true);
  });
});

describe('generateUuidV4', () => {
  it('shape, version, variant, uniqueness (crypto.randomUUID)', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateUuidV4()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('is deterministic for a seeded RandomBytes (injectable)', () => {
    expect(generateUuidV4(seeded(1))).toBe(generateUuidV4(seeded(1)));
    expect(generateUuidV4(seeded(1))).not.toBe(generateUuidV4(seeded(2)));
    expect(generateUuidV4(seeded(1))).toMatch(UUID_V4);
  });

  it('forces version and variant bits even from all-ones / all-zeros bytes', () => {
    expect(generateUuidV4(() => new Uint8Array(16).fill(0xff))).toBe(
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
    );
    expect(generateUuidV4(() => new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('secureRandomBytes uses the platform CSPRNG and refuses to fall back to Math.random', () => {
    expect(secureRandomBytes(16)).toHaveLength(16);
    vi.stubGlobal('crypto', undefined);
    try {
      expect(() => generateUuidV4()).toThrow(/secure random/i);
      expect(() => secureRandomBytes(4)).toThrow(/secure random/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a source that returns the wrong number of bytes', () => {
    expect(() => generateUuidV4(() => new Uint8Array(3))).toThrow(RangeError);
  });
});

describe('balanceCoverage', () => {
  it('reflects the groups present, in arc order', () => {
    expect(balanceCoverage([])).toEqual([false, false, false, false]);
    expect(balanceCoverage(['vegFruit', 'dairy'])).toEqual([true, false, false, true]);
    expect(balanceCoverage(['other'])).toEqual([false, false, false, false]);
    expect(balanceCoverage(['vegFruit', 'protein', 'starch', 'dairy'])).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});

describe('food group parsing', () => {
  it('parseFoodGroup accepts only exact closed-enum names', () => {
    expect(parseFoodGroup('vegFruit')).toBe('vegFruit');
    expect(parseFoodGroup(' protein ')).toBe('protein');
    expect(parseFoodGroup('Protein')).toBeNull();
    expect(parseFoodGroup('veg')).toBeNull();
    expect(parseFoodGroup(3)).toBeNull();
    expect(parseFoodGroup(null)).toBeNull();
  });

  it('unknown stored group names read as other, never throw', () => {
    expect(foodGroupFromStored('dairy')).toBe('dairy');
    expect(foodGroupFromStored('mystery')).toBe('other');
    expect(foodGroupFromStored(undefined)).toBe('other');
  });
});

describe('platesInRange', () => {
  const at = (id: number, loggedAtUtc: number) => ({ id, loggedAtUtc, entries: [] });

  it('is half-open [from, to) and newest first', () => {
    const a = at(1, utc(2026, 8, 15, 0));
    const b = at(2, utc(2026, 8, 15, 12));
    const c = at(3, utc(2026, 8, 16, 0));
    const r = platesInRange([a, b, c], { from: utc(2026, 8, 15), to: utc(2026, 8, 16) });
    expect(r.map((p) => p.id)).toEqual([2, 1]);
    expect(platesInRange([a, b, c]).map((p) => p.id)).toEqual([3, 2, 1]);
  });

  it('returns an immutable list and does not mutate its input', () => {
    const input = [at(1, 1), at(2, 2)];
    const out = platesInRange(input);
    expect(input.map((p) => p.id)).toEqual([1, 2]);
    expect(Object.isFrozen(out)).toBe(true);
  });
});

function adapter(hasTransport: boolean, results: readonly DrainResult[]) {
  let calls = 0;
  const a: SyncAdapter & { readonly calls: () => number } = {
    hasTransport,
    drain: () => Promise.resolve(results[calls++] as DrainResult),
    calls: () => calls,
  };
  return a;
}

const ops = (n: number): SyncOp[] =>
  Array.from({ length: n }, (_, i) => ({
    opId: `op${i}`,
    plateLogId: i,
    enqueuedAtUtc: utc(2026, 1, 1),
    kind: 'plateLogCreated' as const,
    payload: {},
  }));

describe('DrainSyncQueue (F4)', () => {
  it('no transport: nothing read, nothing marked, never "drained"', async () => {
    const queue = new FakeQueue({ pending: ops(2) });
    const a = adapter(false, []);
    const summary = await createDrainSyncQueue({ queue, adapter: a })();
    expect(summary.noTransport).toBe(true);
    expect(summary.drained).toBe(0);
    expect(queue.pendingReads).toBe(0);
    expect(queue.synced).toEqual([]);
    expect(a.calls()).toBe(0);
  });

  it('drained marks synced; permanent marks failed; in order', async () => {
    const queue = new FakeQueue({ pending: ops(2) });
    const a = adapter(true, [DRAINED, drainFailedPermanent('schema')]);
    const summary = await createDrainSyncQueue({ queue, adapter: a })();
    expect(queue.synced).toEqual(['op0']);
    expect(queue.failed).toEqual(['op1']);
    expect(summary.drained).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it('a retryable failure stops the pass and leaves the rest pending', async () => {
    const queue = new FakeQueue({ pending: ops(3) });
    const a = adapter(true, [DRAINED, drainFailedRetryable('5xx'), DRAINED]);
    const summary = await createDrainSyncQueue({ queue, adapter: a })();
    expect(queue.synced).toEqual(['op0']);
    expect(summary.deferred).toBe(2);
    expect(a.calls()).toBe(2);
  });

  it('DrainSkippedNoTransport from the adapter marks nothing', async () => {
    const queue = new FakeQueue({ pending: ops(2) });
    const a = adapter(true, [DRAIN_SKIPPED_NO_TRANSPORT]);
    const summary = await createDrainSyncQueue({ queue, adapter: a })();
    expect(summary.noTransport).toBe(true);
    expect(summary.deferred).toBe(2);
    expect(queue.synced).toEqual([]);
    expect(queue.failed).toEqual([]);
  });

  it('an adapter that throws is a retryable failure', async () => {
    const queue = new FakeQueue({ pending: ops(1) });
    const throwing: SyncAdapter = {
      hasTransport: true,
      drain: () => Promise.reject(new Error('x')),
    };
    const summary = await createDrainSyncQueue({ queue, adapter: throwing })();
    expect(summary.deferred).toBe(1);
    expect(queue.synced).toEqual([]);
  });

  it('a failed markSynced is not counted as drained and stops the pass', async () => {
    const queue = new FakeQueue({ pending: ops(3), markResult: markFailed('disk') });
    const a = adapter(true, [DRAINED, DRAINED, DRAINED]);
    const summary = await createDrainSyncQueue({ queue, adapter: a })();
    expect(summary).toEqual({ drained: 0, failed: 0, deferred: 3, noTransport: false });
    expect(a.calls()).toBe(1);
  });

  it('a failed markFailed is not counted as failed', async () => {
    const queue = new FakeQueue({ pending: ops(2), markResult: markFailed('disk') });
    const a = adapter(true, [drainFailedPermanent('schema'), DRAINED]);
    const summary = await createDrainSyncQueue({ queue, adapter: a })();
    expect(summary).toEqual({ drained: 0, failed: 0, deferred: 2, noTransport: false });
  });

  it('a throwing mark is treated like a failed mark', async () => {
    const queue = new FakeQueue({ pending: ops(1), markResult: 'throw' });
    const summary = await createDrainSyncQueue({ queue, adapter: adapter(true, [DRAINED]) })();
    expect(summary).toEqual({ drained: 0, failed: 0, deferred: 1, noTransport: false });
  });

  it('a full successful pass defers nothing', async () => {
    const queue = new FakeQueue({ pending: ops(2) });
    const a = adapter(true, [DRAINED, DRAINED]);
    const summary = await createDrainSyncQueue({ queue, adapter: a })();
    expect(summary).toEqual({ drained: 2, failed: 0, deferred: 0, noTransport: false });
  });
});
