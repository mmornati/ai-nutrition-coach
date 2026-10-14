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
