import type { EpochMs } from '@anc/core';
import { currentLocale } from '../../i18n';
import { perLocale, type Locale } from '../../i18n/locale';

const timeFormat = perLocale(
  (tag) => new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', hour12: false }),
);
const weekdayLong = perLocale((tag) => new Intl.DateTimeFormat(tag, { weekday: 'long' }));
const weekdayShort = perLocale((tag) => new Intl.DateTimeFormat(tag, { weekday: 'short' }));

export const formatTime = (ms: EpochMs, locale: Locale = currentLocale()): string =>
  timeFormat(locale).format(new Date(ms));
export const weekdayName = (ms: EpochMs, locale: Locale = currentLocale()): string =>
  weekdayLong(locale).format(new Date(ms));
export const weekdayAbbr = (ms: EpochMs, locale: Locale = currentLocale()): string =>
  weekdayShort(locale).format(new Date(ms));

const dayMonth = perLocale(
  (tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short' }),
);
const dayMonthLong = perLocale(
  (tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long' }),
);

/** "13 Oct". */
export const formatDayMonth = (ms: EpochMs, locale: Locale = currentLocale()): string =>
  dayMonth(locale).format(new Date(ms));

/** "7 – 13 October" for a span of days (the week screen's sub-header). */
export function formatDaySpan(
  from: EpochMs,
  to: EpochMs,
  locale: Locale = currentLocale(),
): string {
  const long = dayMonthLong(locale);
  const first = new Date(from);
  const last = new Date(to);
  const startText =
    first.getMonth() === last.getMonth() ? String(first.getDate()) : long.format(first);
  return `${startText} – ${long.format(last)}`;
}
