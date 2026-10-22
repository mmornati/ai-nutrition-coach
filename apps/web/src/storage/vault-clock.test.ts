import { formatHlc, MAX_DRIFT_MS, parseHlc } from '@anc/core';
import { describe, expect, it } from 'vitest';
import { VaultClock, type VaultClockIo, type VaultEnv } from './vault-clock';

const NOW = 1_800_000_000_000;
const env = (now: () => number = () => NOW): VaultEnv => ({
  now,
  randomBytes: (length) => Uint8Array.from({ length }, (_, i) => i + 1),
});

function io(over: Partial<VaultClockIo> = {}): VaultClockIo & { deviceWrites: string[] } {
  const deviceWrites: string[] = [];
  return {
    deviceWrites,
    readDeviceId: () => null,
    writeDeviceId: (id) => void deviceWrites.push(id),
    newestStamp: () => null,
    newestUid: () => null,
    ...over,
  };
}

const stampAt = (wallMs: number) => formatHlc({ wallMs, counter: 0, deviceId: 'bbbbbbbbbbbbbbbb' });

/** A version-7 uid whose time is `ms`. */
const uidAt = (ms: number) => {
  const hex = ms.toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7fff-8000-000000000000`;
};

describe('VaultClock', () => {
  it('makes the device id once, on demand or at open, and reuses a stored one', () => {
    const fresh = io();
    const clock = new VaultClock(env(), fresh);
    clock.ensureDevice();
    clock.ensureDevice();
    clock.stamp();
    expect(fresh.deviceWrites).toEqual(['0102030405060708']);
    const known = io({ readDeviceId: () => 'cccccccccccccccc' });
    new VaultClock(env(), known).stamp();
    expect(known.deviceWrites).toEqual([]);
    // A stored value that is not a device id is replaced.
    const broken = io({ readDeviceId: () => 'nope' });
    new VaultClock(env(), broken).ensureDevice();
    expect(broken.deviceWrites).toHaveLength(1);
  });

  it('builds on the newest stored stamp, even when the wall clock moved back', () => {
    const clock = new VaultClock(
      env(() => NOW - 3_600_000),
      io({ newestStamp: () => stampAt(NOW) }),
    );
    const next = parseHlc(clock.stamp());
    expect(next?.wallMs).toBe(NOW);
    expect(next?.counter).toBe(1);
  });

  it('does not build on a stored stamp beyond the drift bound', () => {
    const clock = new VaultClock(env(), io({ newestStamp: () => stampAt(NOW + MAX_DRIFT_MS + 1) }));
    expect(parseHlc(clock.stamp())?.wallMs).toBe(NOW);
  });

  it('does not adopt an observed stamp beyond the drift bound, and adopts one inside it', () => {
    const clock = new VaultClock(env(), io());
    clock.observe(stampAt(NOW + MAX_DRIFT_MS + 1));
    expect(parseHlc(clock.stamp())?.wallMs).toBe(NOW);
    clock.observe(stampAt(NOW + 60_000));
    expect(parseHlc(clock.stamp())?.wallMs).toBe(NOW + 60_000);
    clock.observe('not a stamp');
    clock.observe(null);
  });

  it('keeps writing when the newest stored stamp is at the very end of the range', () => {
    const end = formatHlc({
      wallMs: 9_999_999_999_999,
      counter: 0xffff,
      deviceId: 'bbbbbbbbbbbbbbbb',
    });
    const clock = new VaultClock(env(), io({ newestStamp: () => end }));
    clock.observe(end);
    expect(() => clock.stamp()).not.toThrow();
  });

  it('continues uids past the newest stored one, unless that one is implausibly far ahead', () => {
    const behind = uidAt(1_000);
    expect(new VaultClock(env(), io({ newestUid: () => behind })).newUid() > behind).toBe(true);

    const newest = uidAt(NOW + 3_600_000);
    const restart = new VaultClock(env(), io({ newestUid: () => newest }));
    expect(restart.newUid() > newest).toBe(true); // the clock is an hour behind the stored uid

    const absurd = uidAt(NOW + 10 * MAX_DRIFT_MS);
    const ignoring = new VaultClock(env(), io({ newestUid: () => absurd }));
    expect(ignoring.newUid() < absurd).toBe(true);
  });
});
