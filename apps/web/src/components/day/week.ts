import { addCalendarDays, isSameLocalDay, startOfLocalDay } from '@anc/core';
import type { EpochMs, PlateLog } from '@anc/core';
import { strings } from '../../i18n';
import {
  dayDetail,
  lineName,
  lineNames,
  joinSentences,
  noteQuietDays,
  noteQuietNever,
  noteSome,
  noteText,
  type WeekSpan,
  routeStop,
  stateSome,
} from '../../i18n/sentences';
import { LINE_GROUPS, groupsOfPlate, orderedGroups, type LineGroup } from '../primitives';
import { formatDayMonthLong, weekdayName } from './format';
import { fill } from '../../i18n';

/** One day of the week, as the route, the network and the list draw it. */
export interface WeekDayData {
  /** 00:00 local of the day. */
  readonly date: EpochMs;
  /** Lines that stopped on this day (any plate). */
  readonly groups: readonly LineGroup[];
  readonly plateCount: number;
  readonly isToday: boolean;
}

/** Seven days ending `end` (today by default), oldest first; the day that is `today` is marked. */
export function buildWeekDays(
  plates: Iterable<PlateLog>,
  today: EpochMs,
  end: EpochMs = today,
): WeekDayData[] {
  const all = Array.from(plates);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addCalendarDays(startOfLocalDay(end), i - 6);
    const dayPlates = all.filter((p) => isSameLocalDay(p.loggedAtUtc, date));
    return {
      date,
      groups: orderedGroups(dayPlates.flatMap(groupsOfPlate)),
      plateCount: dayPlates.length,
      isToday: isSameLocalDay(date, today),
    };
  });
}

export const isFullDay = (d: WeekDayData): boolean => d.groups.length === LINE_GROUPS.length;

/** Nothing logged at all: no plates. */
export const isEmptyDay = (d: WeekDayData): boolean => d.plateCount === 0 && d.groups.length === 0;

/**
 * Logged, but no food group line stopped (e.g. only an "other" food). A day counts as logged
 * when it has at least one plate, so this is NOT the same as an empty day.
 */
export const isLoggedNoLine = (d: WeekDayData): boolean =>
  d.plateCount > 0 && d.groups.length === 0;

export type DayKind = 'empty' | 'loggedNoLine' | 'partial' | 'full';

export function dayKind(d: WeekDayData): DayKind {
  if (isEmptyDay(d)) return 'empty';
  if (isLoggedNoLine(d)) return 'loggedNoLine';
  return isFullDay(d) ? 'full' : 'partial';
}

/** "all four lines", "3 of 4 lines", "logged — no food group line", "nothing logged". */
export function dayState(d: WeekDayData): string {
  const w = strings().week;
  if (isEmptyDay(d)) return w.stateNone;
  if (isLoggedNoLine(d)) return w.stateLoggedNoLine;
  if (isFullDay(d)) return w.stateAllFour;
  return stateSome(d.groups.length);
}

/** Accessible name of a route stop: "<Weekday>, <state>" (plus "today"). */
export function dayRouteLabel(d: WeekDayData): string {
  return routeStop(weekdayName(d.date), dayState(d), d.isToday);
}

/** Text alternative for a whole day: which lines stopped and which were quiet. No app-invented score. */
export function describeDay(d: WeekDayData): string {
  const w = strings().week;
  if (isEmptyDay(d)) return w.dayNothing;
  if (isLoggedNoLine(d)) return w.dayLoggedNoLine;
  if (isFullDay(d)) return w.dayAll;
  const quiet = LINE_GROUPS.filter((g) => !d.groups.includes(g));
  return dayDetail(lineNames(d.groups), lineNames(quiet));
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
 * on a day that had plates. Today is still in progress, so only logged days BEFORE today give a
 * "quiet" verdict; with none, only the lead sentence is shown. Nothing is dropped: every line
 * that never ran shares ONE sentence, and every line quiet on some days gets its own.
 */
export function weekNoteParts(days: readonly WeekDayData[]): WeekNote {
  const w = strings().week;
  // A week that does not hold today is an earlier one: its sentences name its dates, not "this week".
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const span: WeekSpan | undefined =
    firstDay !== undefined && lastDay !== undefined && !days.some((d) => d.isToday)
      ? { from: formatDayMonthLong(firstDay.date), to: formatDayMonthLong(lastDay.date) }
      : undefined;
  const logged = days.filter((d) => d.plateCount > 0 || d.groups.length > 0);
  if (logged.length === 0) {
    const none = span === undefined ? w.noteNone : fill(w.noteNoneEarlier, span);
    return { lead: none, detail: '', text: none };
  }
  const ran = LINE_GROUPS.filter((g) => days.some((d) => d.groups.includes(g)));
  const lead =
    ran.length === LINE_GROUPS.length
      ? span === undefined
        ? w.noteAllRan
        : fill(w.noteAllRanEarlier, span)
      : ran.length === 0
        ? span === undefined
          ? w.noteNoneRan
          : fill(w.noteNoneRanEarlier, span)
        : noteSome(lineNames(ran), span);

  const earlier = logged.filter((d) => !d.isToday);
  if (earlier.length === 0) return { lead, detail: '', text: lead };

  const sentences: string[] = [];
  const never = LINE_GROUPS.filter((g) => !ran.includes(g));
  if (never.length > 0) sentences.push(noteQuietNever(lineNames(never), span));
  const partial = LINE_GROUPS.filter((g) => ran.includes(g))
    .map((g) => ({ g, onDays: earlier.filter((d) => !d.groups.includes(g)) }))
    .filter((q) => q.onDays.length > 0)
    .sort((a, b) => b.onDays.length - a.onDays.length);
  for (const q of partial) {
    sentences.push(
      noteQuietDays(
        lineName(q.g),
        q.onDays.map((d) => weekdayName(d.date)),
      ),
    );
  }
  const detail = joinSentences(sentences);
  return { lead, detail, text: noteText(lead, detail) };
}

export const weekNote = (days: readonly WeekDayData[]): string => weekNoteParts(days).text;
