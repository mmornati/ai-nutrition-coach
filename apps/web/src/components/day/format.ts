import type { EpochMs } from '@anc/core';

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const weekdayLong = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
const weekdayShort = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

export const formatTime = (ms: EpochMs): string => timeFormat.format(new Date(ms));
export const weekdayName = (ms: EpochMs): string => weekdayLong.format(new Date(ms));
export const weekdayAbbr = (ms: EpochMs): string => weekdayShort.format(new Date(ms));

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dayMonthLong = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

/** "13 Oct". */
export const formatDayMonth = (ms: EpochMs): string => dayMonth.format(new Date(ms));

/** "7 – 13 October" for a span of days (the week screen's sub-header). */
export function formatDaySpan(from: EpochMs, to: EpochMs): string {
  const first = new Date(from);
  const last = new Date(to);
  const startText =
    first.getMonth() === last.getMonth() ? String(first.getDate()) : dayMonthLong.format(first);
  return `${startText} – ${dayMonthLong.format(last)}`;
}
