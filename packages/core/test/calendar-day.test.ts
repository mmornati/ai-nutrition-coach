// Calendar-day arithmetic (security review F3), including DST.
//
// The pure-function cases use explicit dates and pass in any zone. The DST group is only
// meaningful in a zone with a daylight-saving transition; `pnpm test:dst` re-runs this file under
// TZ=Europe/Paris (2026-03-29 has 23 hours, 2026-10-25 has 25) with REQUIRE_DST=1, which turns a
// zone without DST into a failure instead of a silent skip.
import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  exportScopeRange,
  isSameLocalDay,
  localTime,
  msUntilNextLocalMidnight,
  startOfLocalDay,
  startOfNextLocalDay,
  visibleDayScope,
  weekScope,
  ALL_HISTORY_SCOPE,
} from '../src/index';

const HOUR = 3_600_000;
const t = localTime;

const isDstZone =
  new Date(2026, 6, 1).getTimezoneOffset() !== new Date(2026, 0, 1).getTimezoneOffset();

describe('calendar arithmetic', () => {
  it('startOfLocalDay drops the time', () => {
    expect(startOfLocalDay(t(2026, 8, 15, 23, 59, 59))).toBe(t(2026, 8, 15));
  });

  it('startOfNextLocalDay rolls month and year', () => {
    expect(startOfNextLocalDay(t(2026, 8, 31, 18))).toBe(t(2026, 9, 1));
    expect(startOfNextLocalDay(t(2026, 12, 31))).toBe(t(2027, 1, 1));
    expect(startOfNextLocalDay(t(2028, 2, 28))).toBe(t(2028, 2, 29));
  });

  it('addCalendarDays goes both ways', () => {
    expect(addCalendarDays(t(2026, 3, 1, 9), -1)).toBe(t(2026, 2, 28));
    expect(addCalendarDays(t(2026, 8, 15), 7)).toBe(t(2026, 8, 22));
  });

  it('isSameLocalDay', () => {
    expect(isSameLocalDay(t(2026, 8, 15, 0), t(2026, 8, 15, 23))).toBe(true);
    expect(isSameLocalDay(t(2026, 8, 15, 23), t(2026, 8, 16, 0))).toBe(false);
  });

  it('msUntilNextLocalMidnight is positive and lands on midnight', () => {
    const now = t(2026, 8, 15, 23, 30);
    const d = msUntilNextLocalMidnight(now);
    expect(d).toBe(30 * 60_000);
    expect(now + d).toBe(t(2026, 8, 16));
    // Exactly at midnight: a full day away, never zero.
    expect(msUntilNextLocalMidnight(t(2026, 8, 15))).toBeGreaterThan(0);
  });
});

describe('across a DST transition', () => {
  it('REQUIRE_DST=1 means the zone MUST have DST (never a silent skip)', () => {
    if (process.env['REQUIRE_DST'] === '1') {
      expect(
        isDstZone,
        `test:dst must run in a daylight-saving zone (TZ is ${process.env['TZ']})`,
      ).toBe(true);
      // Guard against a tzdata change moving the transitions out of the dates asserted below.
      expect(t(2026, 3, 30) - t(2026, 3, 29)).toBe(23 * HOUR);
      expect(t(2026, 10, 26) - t(2026, 10, 25)).toBe(25 * HOUR);
    }
  });

  it.skipIf(!isDstZone)('spring forward: the day is 23h but the next day is the 30th', () => {
    const start = t(2026, 3, 29);
    const next = startOfNextLocalDay(start);
    expect(next).toBe(t(2026, 3, 30));
    expect(next - start).toBe(23 * HOUR);
    // The bug this prevents: +24h lands at 01:00 on the 30th.
    expect(start + 24 * HOUR).not.toBe(next);
  });

  it.skipIf(!isDstZone)('fall back: the day is 25h but the next day is the 26th', () => {
    const start = t(2026, 10, 25);
    const next = startOfNextLocalDay(start);
    expect(next).toBe(t(2026, 10, 26));
    expect(next - start).toBe(25 * HOUR);
    expect(start + 24 * HOUR).not.toBe(next);
  });

  it.skipIf(!isDstZone)('a plate at 23:30 on the spring-forward day stays in that day', () => {
    const day = t(2026, 3, 29);
    const plate = t(2026, 3, 29, 23, 30);
    expect(plate < startOfNextLocalDay(day)).toBe(true);
    expect(plate >= startOfLocalDay(day)).toBe(true);
  });

  it.skipIf(!isDstZone)('a plate at 00:30 on the day after fall-back is not in that day', () => {
    const day = t(2026, 10, 25);
    expect(t(2026, 10, 26, 0, 30) < startOfNextLocalDay(day)).toBe(false);
  });

  it.skipIf(!isDstZone)('the week export range is 7 calendar days across the change', () => {
    const range = exportScopeRange(weekScope(t(2026, 3, 25)));
    expect(range.from).toBe(t(2026, 3, 25));
    expect(range.to).toBe(t(2026, 4, 1));
  });

  it.skipIf(!isDstZone)('midnight timer lands exactly on the next local midnight', () => {
    const now = t(2026, 3, 29, 12);
    expect(now + msUntilNextLocalMidnight(now)).toBe(t(2026, 3, 30));
  });

  it.skipIf(!isDstZone)('a week spanning fall-back is 7 days, not 168 hours', () => {
    const range = exportScopeRange(weekScope(t(2026, 10, 22)));
    expect(range.to).toBe(t(2026, 10, 29));
    expect((range.to ?? 0) - (range.from ?? 0)).toBe(7 * 24 * HOUR + HOUR);
  });
});

describe('export scope range', () => {
  it('visibleDay', () => {
    const r = exportScopeRange(visibleDayScope(t(2026, 8, 15, 14)));
    expect(r.from).toBe(t(2026, 8, 15));
    expect(r.to).toBe(t(2026, 8, 16));
  });

  it('allHistory is open on both ends', () => {
    const r = exportScopeRange(ALL_HISTORY_SCOPE);
    expect(r.from).toBeNull();
    expect(r.to).toBeNull();
  });
});
