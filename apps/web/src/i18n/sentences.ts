import type { MealSlot } from '@anc/core';
import { capitalise, fill, joinNames, joinPlain, plural, strings } from './index';
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
  fill(strings().week.dayDetail, { stopped: joinPlain(stopped), quiet: dayQuiet(quiet) });

export const dayDescription = (day: string, state: string): string =>
  fill(strings().week.dayDescription, { day, state });

export const noteSome = (names: readonly string[]): string =>
  fill(strings().week.noteSome, { names: capitalise(joinNames(names)) });

export const noteQuietDays = (name: string, days: readonly string[]): string =>
  fill(strings().week.noteQuietDays, { name: capitalise(name), days: joinNames(days) });

/** Every line that never ran, in ONE sentence: "Dairy stayed quiet all week." / "A and b were quiet this week." */
export const noteQuietNever = (names: readonly string[]): string => {
  const w = strings().week;
  return names.length === 1
    ? fill(w.noteQuietAll, { name: capitalise(names[0] ?? '') })
    : fill(w.noteQuietMany, { names: capitalise(joinNames(names)) });
};

/** A day as one sentence: "Monday: all four lines." */
export const daySentence = (day: string, state: string): string =>
  fill(strings().week.daySentence, { day, state });

/** Accessible name of a route stop: "<Weekday>, <state>" (plus "today"). */
export const routeStop = (day: string, state: string, isToday: boolean): string => {
  const w = strings().week;
  return fill(isToday ? w.routeStopToday : w.routeStop, { day, state });
};

/** Sentences in order as one run of text (the catalogue owns the separator). */
export const joinSentences = (sentences: readonly string[]): string =>
  sentences.reduce(
    (acc, next) => (acc ? fill(strings().week.sentences, { first: acc, second: next }) : next),
    '',
  );

/** The whole network's text alternative: the intro, then one sentence per day. */
export const networkDescription = (daySentences: readonly string[]): string => {
  const w = strings().week;
  return fill(w.networkDescription, { intro: w.networkIntro, days: joinSentences(daySentences) });
};

/** Lead sentence plus its detail. */
export const noteText = (lead: string, detail: string): string =>
  detail ? fill(strings().week.noteJoin, { lead, detail }) : lead;

/** The portion picker's accessible name for one food. */
export const portionFor = (name: string): string =>
  fill(strings().portion.labelFor, { label: strings().portion.label, name });
