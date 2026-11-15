import type { EpochMs } from '../common';
import type { PlateLog } from '../entities/plate-log';
import { startOfLocalDay } from '../value-types/calendar-day';
import { MAX_UNCOVERED_SHARE, dayNutrients, entryNutrients } from '../value-types/nutrient-totals';
import { NUTRIENT_KEYS, type NutrientKey, type Nutrients } from '../value-types/nutrients';
import { storedGroupOnly, tallyPlate, type GroupsOf } from './day-coaching';

/** The bounded set of "went well" remarks. */
export const WEEKLY_POSITIVES = [
  'vegMostDays',
  'proteinSteady',
  'fibreSteady',
  'saltModerate',
  'sugarsModerate',
  'variedWeek',
] as const;
export type WeeklyPositive = (typeof WEEKLY_POSITIVES)[number];

/** The bounded set of "try next week" suggestions. */
export const WEEKLY_SUGGESTIONS = [
  'moreVeg',
  'moreProtein',
  'moreFibre',
  'easeSalt',
  'easeSugars',
] as const;
export type WeeklySuggestion = (typeof WEEKLY_SUGGESTIONS)[number];

export interface WeeklyHighlight<K extends string> {
  readonly key: K;
  /** Raw numbers for the copy (`days`, `of`, `g`, `pct`). Formatted at display time. */
  readonly params: Readonly<Record<string, number>>;
}

export interface WeeklyGroupDays {
  readonly veg: number;
  readonly protein: number;
  readonly starch: number;
  readonly dairy: number;
}

export interface WeeklyReview {
  /** Local days with at least one plate. A count of the week, never a run of days. */
  readonly daysLogged: number;
  /**
   * Finished local days that pass `isDayCountedForAverages`: the days the averages are drawn from.
   * Today is never one of them.
   */
  readonly countedDays: number;
  /**
   * Finished local days with something logged that were left out of the averages because they do
   * not pass the rule (too little logged to stand for the day). Today is not counted here either.
   */
  readonly excludedDays: number;
  /** Per-day average of each nutrient, over the counted days that know it. A key is absent if none do. */
  readonly averages: Nutrients;
  /** True when any contributing day was estimated. */
  readonly estimated: boolean;
  /** Per nutrient: foods on the counted days that do not contribute to it (absent: none). */
  readonly gaps: Readonly<Partial<Record<NutrientKey, number>>>;
  /** Per nutrient: share of the counted days' weighed foods that do not know it (see `MAX_UNCOVERED_SHARE`). */
  readonly uncoveredShare: Readonly<Partial<Record<NutrientKey, number>>>;
  /** Foods on the counted days with no weight: left out of every average. */
  readonly unweighed: number;
  readonly groupDays: WeeklyGroupDays;
  readonly wentWell: readonly WeeklyHighlight<WeeklyPositive>[];
  readonly tryNext: WeeklyHighlight<WeeklySuggestion> | null;
}

/** A week needs at least this many logged days before the review says anything about it. */
export const MIN_DAYS_FOR_HIGHLIGHTS = 3;

/** A day needs at least this many plates with usable nutrient data to count toward averages. */
export const MIN_PLATES_FOR_AVERAGES = 2;

/** A plate is "usable" when at least one entry has grams and per-100 g nutrients known. */
const plateHasUsableData = (plate: PlateLog): boolean =>
  plate.entries.some((entry) => entryNutrients(entry) !== undefined);

/**
 * Whether a local day is complete enough to stand in the weekly averages. The rule:
 *   the day is strictly before the local day of `today`, AND
 *   it has at least `MIN_PLATES_FOR_AVERAGES` (2) plates that each have at least one entry with
 *   usable nutrient data (grams and per-100 g nutrients both known).
 * Why: today is still being logged, so counting it as a whole day drags every average down; and a
 * day with one logged snack or a single plate is not a day's eating, so averaging it would read
 * as "low protein" or "low fibre" when the log is simply thin. Two plates is a deliberately
 * modest bar (a person logging only lunch and dinner passes) that still filters the one-off entry.
 * `plates` are the plates of that one day; `day` is any instant of it. Pure: `today` is injected,
 * and day boundaries use calendar-day arithmetic, so DST days are safe.
 */
export function isDayCountedForAverages(input: {
  readonly day: EpochMs;
  readonly today: EpochMs;
  readonly plates: readonly PlateLog[];
}): boolean {
  if (startOfLocalDay(input.day) >= startOfLocalDay(input.today)) return false;
  return input.plates.filter(plateHasUsableData).length >= MIN_PLATES_FOR_AVERAGES;
}

const share = (value: number | undefined, target: number): number | undefined =>
  value === undefined ? undefined : value / target;
const whole = (n: number): number => Math.round(n);

/**
 * A rule-based look at up to seven local days: no AI, no score. Highlights need at least
 * `MIN_DAYS_FOR_HIGHLIGHTS` logged days (silence otherwise), at most two go in `wentWell` and at
 * most one in `tryNext`, all from bounded key sets.
 *
 * Nutrient averages (and every rule built on them) use only the days that pass
 * `isDayCountedForAverages`: today is never in them, nor a day with fewer than two plates with
 * usable data. Each nutrient rule also needs `MIN_DAYS_FOR_HIGHLIGHTS` counted days that know that
 * nutrient, so a thin log cannot produce "more protein" or "more fibre". The veg rules use the
 * counted days too; the variety rule counts every logged day.
 *
 * Positives (first two that hold, in this order):
 *   vegMostDays     veg/fruit on >= 60% of the counted days (needs >= 3 of them)
 *   proteinSteady   average protein >= 70% of the guide        (needs >= 3 days with data)
 *   fibreSteady     average fibre >= 70% of the guide          (needs >= 3 days with data)
 *   saltModerate    average salt <= 80% of the guide           (needs >= 3 days with data)
 *   sugarsModerate  average sugars <= 60% of the guide         (needs >= 3 days with data)
 *   variedWeek      every food group on >= 2 days
 * Suggestion (first that holds):
 *   moreVeg      veg/fruit on < 50% of the counted days (needs >= 3 of them)
 *   moreProtein  average protein < 60% of the guide
 *   moreFibre    average fibre < 60% of the guide
 *   easeSalt     average salt >= 100% of the guide
 *   easeSugars   average sugars >= 100% of the guide
 * The thresholds are chosen so a topic is never both praised and suggested.
 */
export function weeklyReview(input: {
  /** The plates of the last seven local days (older ones are ignored by the caller). */
  readonly plates: readonly PlateLog[];
  /** The injected "now": the local day it falls on is in progress and left out of the averages. */
  readonly today: EpochMs;
  readonly targets: Required<Nutrients>;
  readonly groupsOf?: GroupsOf | undefined;
}): WeeklyReview {
  const groupsOf = input.groupsOf ?? storedGroupOnly;
  const byDay = new Map<number, PlateLog[]>();
  for (const plate of input.plates) {
    if (plate.entries.length === 0) continue;
    const day = startOfLocalDay(plate.loggedAtUtc);
    const list = byDay.get(day);
    if (list === undefined) byDay.set(day, [plate]);
    else list.push(plate);
  }

  const sums: Partial<Record<NutrientKey, { total: number; days: number }>> = {};
  let countedDays = 0;
  let excludedDays = 0;
  let estimated = false;
  const countedPlates: PlateLog[] = [];
  let vegCounted = 0;
  const groupDays = { veg: 0, protein: 0, starch: 0, dairy: 0 };
  const todayStart = startOfLocalDay(input.today);
  for (const [dayStart, plates] of byDay) {
    let veg = false;
    let protein = false;
    let starch = false;
    let dairy = false;
    for (const plate of plates) {
      const tally = tallyPlate(plate, groupsOf);
      veg ||= tally.veg > 0;
      protein ||= tally.protein > 0;
      starch ||= tally.starch > 0;
      dairy ||= tally.dairy > 0;
    }
    if (veg) groupDays.veg++;
    if (protein) groupDays.protein++;
    if (starch) groupDays.starch++;
    if (dairy) groupDays.dairy++;

    if (!isDayCountedForAverages({ day: dayStart, today: input.today, plates })) {
      if (dayStart < todayStart) excludedDays++;
      continue;
    }
    const day = dayNutrients(plates);
    countedDays++;
    if (veg) vegCounted++;
    countedPlates.push(...plates);
    estimated ||= day.estimated;
    for (const key of NUTRIENT_KEYS) {
      const value = day.totals[key];
      if (value === undefined) continue;
      const acc = sums[key] ?? { total: 0, days: 0 };
      acc.total += value;
      acc.days++;
      sums[key] = acc;
    }
  }

  const averages: Partial<Record<NutrientKey, number>> = {};
  for (const key of NUTRIENT_KEYS) {
    const acc = sums[key];
    if (acc !== undefined) averages[key] = acc.total / acc.days;
  }
  const counted = dayNutrients(countedPlates);
  const dayCount = (key: NutrientKey): number => sums[key]?.days ?? 0;

  const daysLogged = byDay.size;
  const wentWell: WeeklyHighlight<WeeklyPositive>[] = [];
  let tryNext: WeeklyHighlight<WeeklySuggestion> | null = null;

  if (daysLogged >= MIN_DAYS_FOR_HIGHLIGHTS) {
    const { targets } = input;
    // An average that leaves out more than `MAX_UNCOVERED_SHARE` of the weighed food can be too
    // low: it is never used to praise "moderate" salt or sugars, nor to say "more protein /
    // fibre"; it can still say "ease" when it is already at or above the guide, since the full
    // figure would only be higher. A small hole (a herb without fibre data) does not silence it.
    const known = (key: NutrientKey): number | undefined =>
      dayCount(key) >= MIN_DAYS_FOR_HIGHLIGHTS ? share(averages[key], targets[key]) : undefined;
    const trusted = (key: NutrientKey): number | undefined =>
      (counted.uncoveredShare[key] ?? 0) <= MAX_UNCOVERED_SHARE ? known(key) : undefined;
    const protein = trusted('protein');
    const fibre = trusted('fibre');
    const salt = trusted('salt');
    const sugars = trusted('sugars');
    const saltAtLeast = known('salt');
    const sugarsAtLeast = known('sugars');
    // The same counted days as the averages: today and thin days are in no share. With fewer
    // than `MIN_DAYS_FOR_HIGHLIGHTS` of them the veg rules stay silent.
    const vegShare = countedDays >= MIN_DAYS_FOR_HIGHLIGHTS ? vegCounted / countedDays : undefined;

    const positives: (WeeklyHighlight<WeeklyPositive> | null)[] = [
      vegShare !== undefined && vegShare >= 0.6
        ? { key: 'vegMostDays', params: { days: vegCounted, of: countedDays } }
        : null,
      protein !== undefined && protein >= 0.7
        ? { key: 'proteinSteady', params: { g: whole(averages.protein ?? 0) } }
        : null,
      fibre !== undefined && fibre >= 0.7
        ? { key: 'fibreSteady', params: { g: whole(averages.fibre ?? 0) } }
        : null,
      salt !== undefined && salt <= 0.8
        ? { key: 'saltModerate', params: { g: Math.round((averages.salt ?? 0) * 10) / 10 } }
        : null,
      sugars !== undefined && sugars <= 0.6
        ? { key: 'sugarsModerate', params: { g: whole(averages.sugars ?? 0) } }
        : null,
      Math.min(groupDays.veg, groupDays.protein, groupDays.starch, groupDays.dairy) >= 2
        ? { key: 'variedWeek', params: { of: daysLogged } }
        : null,
    ];
    for (const p of positives) {
      if (p !== null && wentWell.length < 2) wentWell.push(p);
    }

    if (vegShare !== undefined && vegShare < 0.5) {
      tryNext = { key: 'moreVeg', params: { days: vegCounted, of: countedDays } };
    } else if (protein !== undefined && protein < 0.6) {
      tryNext = { key: 'moreProtein', params: { g: whole(averages.protein ?? 0) } };
    } else if (fibre !== undefined && fibre < 0.6) {
      tryNext = { key: 'moreFibre', params: { g: whole(averages.fibre ?? 0) } };
    } else if (saltAtLeast !== undefined && saltAtLeast >= 1) {
      tryNext = {
        key: 'easeSalt',
        params: { g: Math.round((averages.salt ?? 0) * 10) / 10 },
      };
    } else if (sugarsAtLeast !== undefined && sugarsAtLeast >= 1) {
      tryNext = { key: 'easeSugars', params: { g: whole(averages.sugars ?? 0) } };
    }
  }

  return {
    daysLogged,
    countedDays,
    excludedDays,
    averages: Object.freeze(averages),
    estimated,
    gaps: Object.freeze({ ...counted.gaps }),
    uncoveredShare: counted.uncoveredShare,
    unweighed: counted.unweighed,
    groupDays,
    wentWell,
    tryNext,
  };
}
