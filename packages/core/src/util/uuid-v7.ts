import type { RandomBytes } from './uuid-v4';

/** Canonical lower-case UUID text (any version 1-8, RFC 4122 variant). What a `uid` must look like. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

/** 48-bit millisecond Unix time is the largest the layout can hold. */
const MAX_MS = 2 ** 48 - 1;
/** The 12-bit counter in `rand_a` (RFC 9562, method 1) keeps ids ordered within one millisecond. */
const COUNTER_LIMIT = 0xfff;

function build(ms: number, counter: number, tail: Uint8Array): string {
  const bytes = new Uint8Array(16);
  // 48-bit big-endian milliseconds, by division rather than 32-bit shifts (which would truncate).
  let rest = ms;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  bytes[6] = 0x70 | (counter >> 8); // version 7
  bytes[7] = counter & 0xff;
  bytes[8] = 0x80 | ((tail[0] ?? 0) & 0x3f); // variant 10xx
  for (let i = 1; i < 8; i++) bytes[8 + i] = tail[i] ?? 0;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/** The millisecond time and the 12-bit counter of a version-7 UUID, or `null` if it is not one. */
export function uuidV7Parts(uid: string): { readonly ms: number; readonly counter: number } | null {
  if (!isUuid(uid) || uid[14] !== '7') return null;
  const hex = uid.replace(/-/g, '');
  return { ms: parseInt(hex.slice(0, 12), 16), counter: parseInt(hex.slice(13, 16), 16) };
}

/**
 * A generator of RFC 9562 version-7 UUIDs: the first 48 bits are the Unix time in milliseconds, so
 * the text sorts by creation time. Ids made by ONE generator are strictly increasing, even inside
 * the same millisecond and even if the clock steps backwards (it then keeps the last millisecond).
 * `after` is the newest uid already in the store: the generator then continues past it, so a
 * restart with a wall clock that moved back still never issues a smaller uid than one stored. That
 * is what keeps the rows of one parent (entries, notes, interactions) in the order they were
 * written when read back by sorting on `uid`. Pure: the random bytes and the clock are injected
 * (AD-1), nothing here reads the platform.
 */
export function createUuidV7Generator(
  random: RandomBytes,
  now: () => number,
  after?: string,
): () => string {
  const floor = after === undefined ? null : uuidV7Parts(after);
  let lastMs = floor === null ? -1 : floor.ms;
  let counter = floor === null ? 0 : floor.counter;
  return () => {
    const bytes = Uint8Array.from(random(10));
    if (bytes.length !== 10) throw new RangeError('RandomBytes must return 10 bytes');
    const wall = Math.floor(now());
    if (!Number.isFinite(wall) || wall < 0 || wall > MAX_MS) {
      throw new RangeError('The clock must be a millisecond Unix time below 2^48');
    }
    let ms = Math.max(wall, lastMs);
    // A fresh millisecond starts the counter at a random value below 2^11, leaving room to count up.
    let next = (((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0)) & 0x7ff;
    if (ms === lastMs) {
      next = counter + 1;
      if (next > COUNTER_LIMIT) {
        ms += 1; // 4096 ids in one millisecond: borrow the next one
        next = (((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0)) & 0x7ff;
      }
    }
    if (ms > MAX_MS) throw new RangeError('The clock must be a millisecond Unix time below 2^48');
    lastMs = ms;
    counter = next;
    return build(ms, next, bytes.subarray(2));
  };
}
