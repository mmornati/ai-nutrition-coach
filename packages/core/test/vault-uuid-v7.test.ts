import { describe, expect, it } from 'vitest';
import { createUuidV7Generator, isUuid, uuidV7Parts } from '../src/index';
import { seeded } from './vault-fixtures';

const randomFrom = (random: () => number) => (length: number) =>
  Uint8Array.from({ length }, () => Math.floor(random() * 256));

const generateUuidV7 = (random: (length: number) => Uint8Array, nowMs: number): string =>
  createUuidV7Generator(random, () => nowMs)();

describe('UUIDv7', () => {
  it('has the version and variant bits and the millisecond time in the first 48 bits', () => {
    const ms = Date.UTC(2026, 9, 22, 12, 30, 45, 123);
    const id = generateUuidV7(randomFrom(seeded(1)), ms);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(ms);
    expect(isUuid(id)).toBe(true);
  });

  it('is deterministic for the same random bytes and clock', () => {
    const a = generateUuidV7(randomFrom(seeded(9)), 1_800_000_000_000);
    const b = generateUuidV7(randomFrom(seeded(9)), 1_800_000_000_000);
    expect(a).toBe(b);
  });

  it('sorts by time as text', () => {
    const random = randomFrom(seeded(2));
    const ids = [3, 1, 2, 5, 4].map((n) => generateUuidV7(random, 1_800_000_000_000 + n * 1000));
    expect([...ids].sort().map((id) => ids.indexOf(id))).toEqual([1, 2, 0, 4, 3]);
  });

  it('one generator is strictly increasing, inside a millisecond and when the clock steps back', () => {
    const clock = [5000, 5000, 5000, 4000, 4000, 6000];
    let i = 0;
    const next = createUuidV7Generator(randomFrom(seeded(3)), () => clock[Math.min(i++, 5)] ?? 0);
    const ids = clock.map(() => next());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stays increasing past 4096 ids in one millisecond by borrowing the next one', () => {
    const next = createUuidV7Generator(randomFrom(seeded(4)), () => 7000);
    const ids = Array.from({ length: 5000 }, next);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(5000);
  });

  it('continues past the newest uid already stored, even when the clock is behind it', () => {
    const random = randomFrom(seeded(8));
    const stored = generateUuidV7(random, 9_000);
    const parts = uuidV7Parts(stored);
    expect(parts?.ms).toBe(9_000);
    const next = createUuidV7Generator(random, () => 1_000, stored);
    const ids = Array.from({ length: 5 }, next);
    expect([...ids].sort()).toEqual(ids);
    expect(ids.every((id) => id > stored)).toBe(true);
    // A value that is not a version-7 uid is ignored.
    expect(uuidV7Parts('00000000-0000-4000-8000-000000000000')).toBeNull();
    const plain = createUuidV7Generator(random, () => 2_000, 'nope');
    expect(uuidV7Parts(plain())?.ms).toBe(2_000);
  });

  it('refuses a short random source and a clock outside 48 bits', () => {
    expect(() => generateUuidV7(() => new Uint8Array(3), 1)).toThrow(RangeError);
    expect(() => generateUuidV7(randomFrom(seeded(5)), -1)).toThrow(RangeError);
    expect(() => generateUuidV7(randomFrom(seeded(5)), 2 ** 48)).toThrow(RangeError);
    expect(() => generateUuidV7(randomFrom(seeded(5)), Number.NaN)).toThrow(RangeError);
  });

  it('isUuid accepts canonical lower-case UUIDs only', () => {
    expect(isUuid('018f4c3e-7a1b-7c2d-8e3f-0123456789ab')).toBe(true);
    expect(isUuid('018F4C3E-7A1B-7C2D-8E3F-0123456789AB')).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
