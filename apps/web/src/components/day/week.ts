import { addCalendarDays, isSameLocalDay, startOfLocalDay } from '@anc/core';
import type { EpochMs, PlateLog } from '@anc/core';
import { weekdayName } from './format';
import { LINE_GROUPS, groupsOfPlate, orderedGroups } from './lines';
import { dayStrings, type LineGroup } from './strings';

/** One day of the week, as the route, the network and the list draw it. */
export interface WeekDayData {
  /** 00:00 local of the day. */
  readonly date: EpochMs;
  /** Lines that stopped on this day (any plate). */
  readonly groups: readonly LineGroup[];
  readonly plateCount: number;
  readonly isToday: boolean;
}

/** Seven days ending `today`, oldest first. */
export function buildWeekDays(plates: Iterable<PlateLog>, today: EpochMs): WeekDayData[] {
  const all = Array.from(plates);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addCalendarDays(startOfLocalDay(today), i - 6);
    const dayPlates = all.filter((p) => isSameLocalDay(p.loggedAtUtc, date));
    return {
      date,
      groups: orderedGroups(dayPlates.flatMap(groupsOfPlate)),
      plateCount: dayPlates.length,
      isToday: i === 6,
    };
  });
}

export const isFullDay = (d: WeekDayData): boolean => d.groups.length === LINE_GROUPS.length;

/** "all four lines", "3 of 4 lines", "nothing logged". */
export function dayState(d: WeekDayData): string {
  if (isFullDay(d)) return dayStrings.stateAllFour;
  if (d.groups.length === 0) return dayStrings.stateNone;
  return dayStrings.stateSome(d.groups.length);
}

/** Accessible name of a route stop: "<Weekday>, <state>" (plus "today"). */
export function dayRouteLabel(d: WeekDayData): string {
  const base = `${weekdayName(d.date)}, ${dayState(d)}`;
  return d.isToday ? `${base}, ${dayStrings.todayWord}` : base;
}

const names = (groups: readonly LineGroup[]): string[] => groups.map(dayStrings.lineName);

/** Text alternative for a whole day: which lines stopped and which were quiet. Never a score. */
export function describeDay(d: WeekDayData): string {
  if (d.groups.length === 0) return dayStrings.dayNothing;
  if (isFullDay(d)) return dayStrings.dayAll;
  const quiet = LINE_GROUPS.filter((g) => !d.groups.includes(g));
  return `${names(d.groups).join(', ')}; ${dayStrings.dayQuiet(names(quiet))}`;
}

export interface WeekNote {
  /** The bold opening sentence. */
  readonly lead: string;
  /** The rest; may be empty. */
  readonly detail: string;
  readonly text: string;
}

/**
 * The week observation, in words and without counts: which lines ran, and where one went quiet
 * on a day that had plates. Today is still in progress, so it never counts as quiet.
 */
export function weekNoteParts(days: readonly WeekDayData[]): WeekNote {
  const logged = days.filter((d) => d.plateCount > 0 || d.groups.length > 0);
  if (logged.length === 0) {
    return { lead: dayStrings.noteNone, detail: '', text: dayStrings.noteNone };
  }
  const ran = LINE_GROUPS.filter((g) => days.some((d) => d.groups.includes(g)));
  const lead =
    ran.length === LINE_GROUPS.length ? dayStrings.noteAllRan : dayStrings.noteSome(names(ran));

  const sentences: string[] = [];
  const quiet = LINE_GROUPS.map((g) => ({
    g,
    onDays: logged.filter((d) => !d.isToday && !d.groups.includes(g)),
  }));
  // Lines that never ran first, then the ones with the most quiet days; at most two sentences.
  for (const g of LINE_GROUPS.filter((x) => !ran.includes(x))) {
    sentences.push(dayStrings.noteQuietAll(dayStrings.lineName(g)));
  }
  const partial = quiet
    .filter((q) => ran.includes(q.g) && q.onDays.length > 0)
    .sort((a, b) => b.onDays.length - a.onDays.length);
  for (const q of partial) {
    sentences.push(
      dayStrings.noteQuietDays(
        dayStrings.lineName(q.g),
        q.onDays.map((d) => weekdayName(d.date)),
      ),
    );
  }
  const detail = sentences.slice(0, 2).join(' ');
  return { lead, detail, text: detail ? `${lead} ${detail}` : lead };
}

export const weekNote = (days: readonly WeekDayData[]): string => weekNoteParts(days).text;
