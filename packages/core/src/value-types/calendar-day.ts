import type { EpochMs } from '../common';

// Calendar-day arithmetic is done by constructing local dates (`new Date(y, m, d + n)`), never by
// adding 24 hours: on a DST day a local day is 23 or 25 hours long.

/** Builds a local-time instant. `month` is 1-12 (not the 0-based `Date` convention). */
export function localTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): EpochMs {
  return new Date(year, month - 1, day, hour, minute, second, millisecond).getTime();
}

/** 00:00 local of the day containing `moment`. */
export function startOfLocalDay(moment: EpochMs): EpochMs {
  const d = new Date(moment);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 00:00 local, `days` calendar days after (or before, if negative) the day of `moment`. */
export function addCalendarDays(moment: EpochMs, days: number): EpochMs {
  const d = new Date(moment);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

export function startOfNextLocalDay(moment: EpochMs): EpochMs {
  return addCalendarDays(moment, 1);
}

export function isSameLocalDay(a: EpochMs, b: EpochMs): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/** Milliseconds from `now` to the next local midnight. Always positive, even at 00:00 exactly. */
export function msUntilNextLocalMidnight(now: EpochMs): number {
  return startOfNextLocalDay(now) - now;
}

/** The half-open `[from, to)` range of the local day containing `day`. */
export function localDayRange(day: EpochMs): { readonly from: EpochMs; readonly to: EpochMs } {
  return { from: startOfLocalDay(day), to: startOfNextLocalDay(day) };
}
