// Hybrid logical clock (Kulkarni et al.): wall time that never goes backwards, a counter for events
// inside the same millisecond, and the device that stamped it. The text form sorts like the
// instants it encodes, so "which write is newer" is a plain string comparison and a stamp can live
// in a TEXT column and in a snapshot unchanged:
//
//   <13-digit wall ms>-<4 hex counter>-<16 hex device id>     e.g. 0001790000000-0001-9f3a5c20d41b7e08
//
// Everything here is pure: the caller supplies the wall clock and the device id (AD-1). Two devices
// never produce the same stamp (the device id differs), so the order is total.

export interface Hlc {
  readonly wallMs: number;
  readonly counter: number;
  readonly deviceId: string;
}

const HLC_PATTERN = /^(\d{13})-([0-9a-f]{4})-([0-9a-f]{16})$/;
const DEVICE_ID_PATTERN = /^[0-9a-f]{16}$/;
const MAX_COUNTER = 0xffff;
const MAX_WALL_MS = 9_999_999_999_999;

/**
 * How far ahead of this device's wall clock a stamp from elsewhere may be before it is not
 * believed: a device whose clock is a day wrong must not drag every other device's clock (and so
 * every later write) into the future. Beyond it a received stamp is ignored, and a snapshot that
 * carries one is refused by the stores.
 */
export const MAX_DRIFT_MS = 24 * 3_600_000;

/** True when `stamp` is a valid stamp whose wall time is later than `limitMs`. */
export const hlcBeyond = (stamp: string, limitMs: number): boolean => {
  const parsed = parseHlc(stamp);
  return parsed !== null && parsed.wallMs > limitMs;
};

/** The stamp that sorts before every real one: "never written on any device". */
export const ZERO_HLC = '0000000000000-0000-0000000000000000';

export const isDeviceId = (value: unknown): value is string =>
  typeof value === 'string' && DEVICE_ID_PATTERN.test(value);

/** A device id from 8 random bytes. */
export function deviceIdFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== 8) throw new RangeError('A device id needs 8 random bytes');
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function formatHlc(hlc: Hlc): string {
  if (
    !Number.isInteger(hlc.wallMs) ||
    hlc.wallMs < 0 ||
    hlc.wallMs > MAX_WALL_MS ||
    !Number.isInteger(hlc.counter) ||
    hlc.counter < 0 ||
    hlc.counter > MAX_COUNTER ||
    !isDeviceId(hlc.deviceId)
  ) {
    throw new RangeError('Not a valid hybrid logical clock value');
  }
  return `${String(hlc.wallMs).padStart(13, '0')}-${hlc.counter.toString(16).padStart(4, '0')}-${hlc.deviceId}`;
}

/** `null` for anything that is not exactly a stamp in the text form above. */
export function parseHlc(text: unknown): Hlc | null {
  if (typeof text !== 'string') return null;
  const match = HLC_PATTERN.exec(text);
  if (!match) return null;
  return {
    wallMs: Number(match[1]),
    counter: parseInt(match[2] ?? '', 16),
    deviceId: match[3] ?? '',
  };
}

export const isHlc = (text: unknown): text is string => parseHlc(text) !== null;

/** Total order on stamps: negative when `a` is older than `b`. Equal only for the same stamp. */
export function compareHlc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function advance(wallMs: number, counter: number): { wallMs: number; counter: number } {
  // The wall time can never leave the 13-digit range the text form holds.
  const wall = Math.min(wallMs, MAX_WALL_MS);
  if (counter <= MAX_COUNTER) return { wallMs: wall, counter };
  // 65,536 events inside one millisecond: borrow the next millisecond rather than overflow; at the
  // very end of the range, saturate (a stamp is repeated, never malformed).
  return wall < MAX_WALL_MS
    ? { wallMs: wall + 1, counter: 0 }
    : { wallMs: wall, counter: MAX_COUNTER };
}

/**
 * The stamp for a local event at `nowMs`: strictly newer than `last` (this device's previous
 * stamp, or `null` the first time), even when the wall clock repeats or steps backwards.
 */
export function tickHlc(last: Hlc | null, nowMs: number, deviceId: string): Hlc {
  const now = Math.floor(nowMs);
  const base = last === null ? -1 : last.wallMs;
  const wallMs = Math.max(now, base);
  const counter = last !== null && wallMs === last.wallMs ? last.counter + 1 : 0;
  return { ...advance(wallMs, counter), deviceId };
}

/**
 * The stamp after seeing `remote` (a stamp from another device): newer than both `last` and
 * `remote`, so anything written afterwards is ordered after everything this device has seen.
 */
export function receiveHlc(last: Hlc | null, remote: Hlc, nowMs: number, deviceId: string): Hlc {
  const now = Math.floor(nowMs);
  // A stamp from further ahead than the drift bound is not adopted: it is as if it had not arrived.
  if (remote.wallMs > now + MAX_DRIFT_MS) return tickHlc(last, now, deviceId);
  const lastWall = last === null ? -1 : last.wallMs;
  const wallMs = Math.max(now, lastWall, remote.wallMs);
  let counter = 0;
  const fromLast = last !== null && wallMs === last.wallMs;
  const fromRemote = wallMs === remote.wallMs;
  if (fromLast && fromRemote) counter = Math.max(last.counter, remote.counter) + 1;
  else if (fromLast) counter = last.counter + 1;
  else if (fromRemote) counter = remote.counter + 1;
  return { ...advance(wallMs, counter), deviceId };
}
