import { describe, expect, it } from 'vitest';
import {
  compareHlc,
  deviceIdFromBytes,
  formatHlc,
  hlcBeyond,
  isDeviceId,
  MAX_DRIFT_MS,
  parseHlc,
  receiveHlc,
  tickHlc,
  ZERO_HLC,
} from '../src/index';
import { DEVICE_A, DEVICE_B } from './vault-fixtures';

describe('hybrid logical clock', () => {
  it('formats to a fixed-width, sortable text and parses back', () => {
    const text = formatHlc({ wallMs: 1_790_000_000_000, counter: 10, deviceId: DEVICE_A });
    expect(text).toBe('1790000000000-000a-aaaaaaaaaaaaaaaa');
    expect(parseHlc(text)).toEqual({ wallMs: 1_790_000_000_000, counter: 10, deviceId: DEVICE_A });
    expect(parseHlc(ZERO_HLC)).toEqual({ wallMs: 0, counter: 0, deviceId: '0000000000000000' });
  });

  it('rejects anything that is not exactly a stamp', () => {
    for (const bad of [
      '',
      '1790000000000-000a',
      '1790000000000-000A-aaaaaaaaaaaaaaaa',
      '179000000000-000a-aaaaaaaaaaaaaaaa',
      '1790000000000-000a-aaaaaaaaaaaaaaa',
      ' 1790000000000-000a-aaaaaaaaaaaaaaaa',
      null,
      42,
    ]) {
      expect(parseHlc(bad)).toBeNull();
    }
    expect(() => formatHlc({ wallMs: -1, counter: 0, deviceId: DEVICE_A })).toThrow(RangeError);
    expect(() => formatHlc({ wallMs: 1, counter: 0x10000, deviceId: DEVICE_A })).toThrow(
      RangeError,
    );
    expect(() => formatHlc({ wallMs: 1, counter: 0, deviceId: 'nope' })).toThrow(RangeError);
  });

  it('text order is time order (wall, then counter, then device)', () => {
    const at = (wallMs: number, counter: number, deviceId = DEVICE_A) =>
      formatHlc({ wallMs, counter, deviceId });
    const ordered = [
      ZERO_HLC,
      at(9, 0xffff),
      at(10, 0),
      at(10, 1),
      at(10, 0x10),
      at(10, 0x10, DEVICE_B),
      at(11, 0),
    ];
    expect([...ordered].reverse().sort()).toEqual(ordered);
    expect(compareHlc(ordered[1] as string, ordered[2] as string)).toBe(-1);
    expect(compareHlc(ordered[2] as string, ordered[2] as string)).toBe(0);
    expect(compareHlc(ordered[3] as string, ordered[2] as string)).toBe(1);
  });

  it('tick follows the wall clock, counts within a millisecond and never goes back', () => {
    const first = tickHlc(null, 1000, DEVICE_A);
    expect(first).toEqual({ wallMs: 1000, counter: 0, deviceId: DEVICE_A });
    const same = tickHlc(first, 1000, DEVICE_A);
    expect(same.counter).toBe(1);
    const back = tickHlc(same, 900, DEVICE_A);
    expect(back).toEqual({ wallMs: 1000, counter: 2, deviceId: DEVICE_A });
    const later = tickHlc(back, 1001, DEVICE_A);
    expect(later).toEqual({ wallMs: 1001, counter: 0, deviceId: DEVICE_A });
    const stamps = [first, same, back, later].map(formatHlc);
    expect([...stamps].sort()).toEqual(stamps);
  });

  it('tick borrows the next millisecond rather than overflow the counter', () => {
    const full = { wallMs: 5, counter: 0xffff, deviceId: DEVICE_A };
    expect(tickHlc(full, 5, DEVICE_A)).toEqual({ wallMs: 6, counter: 0, deviceId: DEVICE_A });
  });

  it('receive orders after everything seen, keeping the local device', () => {
    const local = { wallMs: 1000, counter: 3, deviceId: DEVICE_A };
    const remote = { wallMs: 2000, counter: 7, deviceId: DEVICE_B };
    const after = receiveHlc(local, remote, 1500, DEVICE_A);
    expect(after).toEqual({ wallMs: 2000, counter: 8, deviceId: DEVICE_A });
    // The device suffix breaks ties, but the counter already moved past the remote one.
    expect(compareHlc(formatHlc(after), formatHlc(remote))).toBe(1);
    // A wall clock ahead of both wins outright.
    expect(receiveHlc(local, remote, 5000, DEVICE_A)).toEqual({
      wallMs: 5000,
      counter: 0,
      deviceId: DEVICE_A,
    });
    // Same millisecond on both sides: the larger counter plus one.
    expect(receiveHlc({ ...local, wallMs: 2000, counter: 9 }, remote, 100, DEVICE_A).counter).toBe(
      10,
    );
    // First ever stamp on this device.
    expect(receiveHlc(null, remote, 100, DEVICE_A)).toEqual({
      wallMs: 2000,
      counter: 8,
      deviceId: DEVICE_A,
    });
    // Local ahead of the remote.
    expect(receiveHlc({ ...local, wallMs: 3000 }, remote, 100, DEVICE_A)).toEqual({
      wallMs: 3000,
      counter: 4,
      deviceId: DEVICE_A,
    });
  });

  it('never adopts a stamp from further ahead than the drift bound', () => {
    const now = 1_000_000_000_000;
    const local = { wallMs: now - 5, counter: 2, deviceId: DEVICE_A };
    const farAhead = { wallMs: now + MAX_DRIFT_MS + 1, counter: 0, deviceId: DEVICE_B };
    // As if it had not arrived: an ordinary tick.
    expect(receiveHlc(local, farAhead, now, DEVICE_A)).toEqual(tickHlc(local, now, DEVICE_A));
    expect(receiveHlc(null, farAhead, now, DEVICE_A)).toEqual(tickHlc(null, now, DEVICE_A));
    // Exactly at the bound it is believed.
    const atBound = { wallMs: now + MAX_DRIFT_MS, counter: 4, deviceId: DEVICE_B };
    expect(receiveHlc(local, atBound, now, DEVICE_A).wallMs).toBe(now + MAX_DRIFT_MS);
    expect(hlcBeyond(formatHlc(farAhead), now + MAX_DRIFT_MS)).toBe(true);
    expect(hlcBeyond(formatHlc(atBound), now + MAX_DRIFT_MS)).toBe(false);
    expect(hlcBeyond('garbage', 0)).toBe(false);
  });

  it('never leaves the range the text form holds: it saturates instead of throwing', () => {
    const max = 9_999_999_999_999;
    const last = { wallMs: max, counter: 0xffff, deviceId: DEVICE_A };
    const next = tickHlc(last, 5, DEVICE_A);
    expect(next).toEqual(last);
    expect(() => formatHlc(next)).not.toThrow();
    expect(tickHlc(null, max + 1_000, DEVICE_A).wallMs).toBe(max);
    const received = receiveHlc(last, { ...last, deviceId: DEVICE_B }, max + 10, DEVICE_A);
    expect(() => formatHlc(received)).not.toThrow();
  });

  it('device ids are 16 lower-case hex characters made from 8 random bytes', () => {
    const id = deviceIdFromBytes(Uint8Array.from([0, 1, 2, 3, 250, 251, 252, 255]));
    expect(id).toBe('00010203fafbfcff');
    expect(isDeviceId(id)).toBe(true);
    expect(isDeviceId('FAFBFCFF00010203')).toBe(false);
    expect(() => deviceIdFromBytes(new Uint8Array(4))).toThrow(RangeError);
  });
});
