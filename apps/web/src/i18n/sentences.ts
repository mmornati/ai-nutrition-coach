import type { MealSlot } from '@anc/core';
import { capitalise, fill, joinNames, plural, strings } from './index';
import type { LineGroup } from '../components/primitives/lines';

/**
 * Typed sentence builders for copy assembled from parts (names, counts, times). Every word comes
 * from `en.ts`; these only fill placeholders, pick plural forms and join lists.
 */

/** Lower-case line name for mid-sentence use: the one i18n spelling, lower-cased. */
export const lineName = (g: LineGroup): string => strings().groups[g].toLowerCase();

export const slotName = (s: MealSlot): string => strings().slots[s];

export const lineNames = (groups: readonly LineGroup[]): string[] => groups.map(lineName);

export const passedThrough = (names: readonly string[]): string =>
  fill(strings().day.passedThrough, { names: capitalise(joinNames(names)) });

/** Accessible name of a station's detail button: groups by name, never a count. */
export function stationLabel(args: {
  meal: string;
  time: string;
  present: readonly string[];
  passed: readonly string[];
}): string {
  const d = strings().day;
  const { meal, time, present, passed } = args;
  const stops =
    present.length > 0
      ? fill(d.stationStopped, { names: joinNames(present) })
      : d.stationNoneStopped;
  if (passed.length === 0) return fill(d.stationLabel, { meal, time, stops });
  return fill(d.stationLabelPassed, {
    meal,
    time,
    stops,
    passed: fill(d.stationPassed, { names: capitalise(joinNames(passed)) }),
  });
}

export const removePlateFor = (meal: string, time: string): string =>
  fill(strings().day.removePlateFor, { meal, time });

export const dismissHint = (hint: string): string => fill(strings().day.dismissHint, { hint });

/** Aggregate sync announcement: retry-later first (it needs attention), then waiting, then done. */
export function syncAnnouncement(pending: number, retryLater: number): string {
  const c = strings().chip;
  if (retryLater > 0) return plural(c.retryLaterPlates, retryLater);
  if (pending > 0) return plural(c.waiting, pending);
  return c.allSynced;
}

export const platesCount = (n: number): string => plural(strings().week.plates, n);

export const stateSome = (n: number): string => fill(strings().week.stateSome, { count: n });

export const dayQuiet = (names: readonly string[]): string =>
  fill(strings().week.dayQuiet, { names: joinNames(names) });

export const dayDetail = (stopped: readonly string[], quiet: readonly string[]): string =>
  fill(strings().week.dayDetail, { stopped: stopped.join(', '), quiet: dayQuiet(quiet) });

export const dayDescription = (day: string, state: string): string =>
  fill(strings().week.dayDescription, { day, state });

export const noteSome = (names: readonly string[]): string =>
  fill(strings().week.noteSome, { names: capitalise(joinNames(names)) });

export const noteQuietDays = (name: string, days: readonly string[]): string =>
  fill(strings().week.noteQuietDays, { name: capitalise(name), days: joinNames(days) });

export const noteQuietAll = (name: string): string =>
  fill(strings().week.noteQuietAll, { name: capitalise(name) });
