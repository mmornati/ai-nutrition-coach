import { describe, expect, it } from 'vitest';
import { localTime, todayOf, watchToday, type Schedule } from '../src/index';

/** A manual scheduler: nothing fires until the test advances the clock and calls `fire`. */
function fakeTimers() {
  const pending: { callback: () => void; delayMs: number; cancelled: boolean }[] = [];
  const schedule: Schedule = (callback, delayMs) => {
    const timer = { callback, delayMs, cancelled: false };
    pending.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };
  return {
    schedule,
    pending,
    live: () => pending.filter((t) => !t.cancelled),
    fireLatest: () =>
      pending
        .filter((t) => !t.cancelled)
        .at(-1)
        ?.callback(),
  };
}

describe('today (one injectable clock)', () => {
  it('todayOf is 00:00 local of the clock day', () => {
    expect(todayOf(() => localTime(2026, 8, 15, 23, 59))).toBe(localTime(2026, 8, 15));
    expect(todayOf(() => localTime(2026, 8, 16, 0, 0))).toBe(localTime(2026, 8, 16));
  });

  it('arms a timer for the next local midnight', () => {
    const timers = fakeTimers();
    const now = localTime(2026, 8, 15, 23, 30);
    watchToday({ clock: () => now, schedule: timers.schedule, onChange: () => undefined });
    expect(timers.live()).toHaveLength(1);
    expect(timers.live()[0]?.delayMs).toBe(30 * 60_000);
  });

  it('a board left open overnight rolls over at local midnight', () => {
    const timers = fakeTimers();
    let now = localTime(2026, 8, 15, 23, 30);
    const seen: number[] = [];
    watchToday({ clock: () => now, schedule: timers.schedule, onChange: (d) => seen.push(d) });

    now = localTime(2026, 8, 16, 0, 0, 1);
    timers.fireLatest();

    expect(seen).toEqual([localTime(2026, 8, 16)]);
    // and it re-armed for the following midnight
    expect(timers.live().at(-1)?.delayMs).toBe(86_400_000 - 1000);
  });

  it('keeps rolling over night after night', () => {
    const timers = fakeTimers();
    let now = localTime(2026, 8, 15, 22);
    const seen: number[] = [];
    watchToday({ clock: () => now, schedule: timers.schedule, onChange: (d) => seen.push(d) });
    for (const d of [16, 17, 18]) {
      now = localTime(2026, 8, d, 0, 0, 0, 5);
      timers.fireLatest();
    }
    expect(seen).toEqual([localTime(2026, 8, 16), localTime(2026, 8, 17), localTime(2026, 8, 18)]);
  });

  it('an early timer fire (clock still on the same day) does not change today and re-arms', () => {
    const timers = fakeTimers();
    let now = localTime(2026, 8, 15, 23, 59, 59);
    const seen: number[] = [];
    watchToday({ clock: () => now, schedule: timers.schedule, onChange: (d) => seen.push(d) });
    now = localTime(2026, 8, 15, 23, 59, 59, 900);
    timers.fireLatest();
    expect(seen).toEqual([]);
    expect(timers.live().at(-1)?.delayMs).toBe(100);
  });

  it('cancel stops the timer and ignores a late fire', () => {
    const timers = fakeTimers();
    let now = localTime(2026, 8, 15, 23);
    const seen: number[] = [];
    const { cancel: stop } = watchToday({
      clock: () => now,
      schedule: timers.schedule,
      onChange: (d) => seen.push(d),
    });
    const armed = timers.pending[0];
    stop();
    expect(armed?.cancelled).toBe(true);
    now = localTime(2026, 8, 16, 1);
    armed?.callback();
    expect(seen).toEqual([]);
    expect(timers.pending).toHaveLength(1);
  });

  it('a throwing onChange never stops rollover: the timer is re-armed', () => {
    const timers = fakeTimers();
    let now = localTime(2026, 8, 15, 23, 30);
    const seen: number[] = [];
    watchToday({
      clock: () => now,
      schedule: timers.schedule,
      onChange: (d) => {
        seen.push(d);
        if (seen.length === 1) throw new Error('listener bug');
      },
    });
    now = localTime(2026, 8, 16, 0, 0, 1);
    expect(() => timers.fireLatest()).toThrow('listener bug');
    expect(timers.pending).toHaveLength(2);
    now = localTime(2026, 8, 17, 0, 0, 1);
    timers.fireLatest();
    expect(seen).toEqual([localTime(2026, 8, 16), localTime(2026, 8, 17)]);
  });

  it('recheck recomputes today immediately and re-arms for the next midnight', () => {
    const timers = fakeTimers();
    let now = localTime(2026, 8, 15, 23, 30);
    const seen: number[] = [];
    const watch = watchToday({
      clock: () => now,
      schedule: timers.schedule,
      onChange: (d) => seen.push(d),
    });
    watch.recheck();
    expect(seen).toEqual([]);

    // The tab slept through midnight; timers did not fire.
    now = localTime(2026, 8, 16, 9);
    const stale = timers.pending[0];
    watch.recheck();
    expect(seen).toEqual([localTime(2026, 8, 16)]);
    expect(stale?.cancelled).toBe(true);
    expect(timers.live()).toHaveLength(1);
    expect(timers.live()[0]?.delayMs).toBe(15 * 3_600_000);

    watch.recheck();
    expect(seen).toHaveLength(1);
  });

  it('recheck re-arms even when onChange throws, and does nothing after cancel', () => {
    const timers = fakeTimers();
    let now = localTime(2026, 8, 15, 23);
    const watch = watchToday({
      clock: () => now,
      schedule: timers.schedule,
      onChange: () => {
        throw new Error('listener bug');
      },
    });
    now = localTime(2026, 8, 16, 1);
    expect(() => watch.recheck()).toThrow('listener bug');
    expect(timers.live()).toHaveLength(1);
    expect(timers.pending).toHaveLength(2);

    watch.cancel();
    const armed = timers.pending.length;
    now = localTime(2026, 8, 17, 1);
    watch.recheck();
    expect(timers.pending).toHaveLength(armed);
  });
});
