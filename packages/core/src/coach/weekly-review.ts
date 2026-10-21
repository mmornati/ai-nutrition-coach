import type { PlateLog } from '../entities/plate-log';
import { startOfLocalDay } from '../value-types/calendar-day';
import { dayNutrients } from '../value-types/nutrient-totals';
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
  /** Local days that have nutrient data (weights and nutrients known for some entry). */
  readonly daysWithData: number;
  /** Per-day average of each nutrient, over the days that know it. A key is absent if none do. */
  readonly averages: Nutrients;
  /** True when any contributing day was estimated. */
  readonly estimated: boolean;
  readonly groupDays: WeeklyGroupDays;
  readonly wentWell: readonly WeeklyHighlight<WeeklyPositive>[];
  readonly tryNext: WeeklyHighlight<WeeklySuggestion> | null;
}

/** A week needs at least this many logged days before the review says anything about it. */
export const MIN_DAYS_FOR_HIGHLIGHTS = 3;

const share = (value: number | undefined, target: number): number | undefined =>
  value === undefined ? undefined : value / target;
const whole = (n: number): number => Math.round(n);

/**
 * A rule-based look at up to seven local days: no AI, no score. Highlights need at least
 * `MIN_DAYS_FOR_HIGHLIGHTS` logged days (silence otherwise), at most two go in `wentWell` and at
 * most one in `tryNext`, all from bounded key sets.
 *
 * Positives (first two that hold, in this order):
 *   vegMostDays     veg/fruit on >= 60% of logged days
 *   proteinSteady   average protein >= 70% of the guide        (needs >= 3 days with data)
 *   fibreSteady     average fibre >= 70% of the guide          (needs >= 3 days with data)
 *   saltModerate    average salt <= 80% of the guide           (needs >= 3 days with data)
 *   sugarsModerate  average sugars <= 60% of the guide         (needs >= 3 days with data)
 *   variedWeek      every food group on >= 2 days
 * Suggestion (first that holds):
 *   moreVeg      veg/fruit on < 50% of logged days
 *   moreProtein  average protein < 60% of the guide
 *   moreFibre    average fibre < 60% of the guide
 *   easeSalt     average salt >= 100% of the guide
 *   easeSugars   average sugars >= 100% of the guide
 * The thresholds are chosen so a topic is never both praised and suggested.
 */
export function weeklyReview(input: {
  /** The plates of the last seven local days (older ones are ignored by the caller). */
  readonly plates: readonly PlateLog[];
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
  let daysWithData = 0;
  let estimated = false;
  const groupDays = { veg: 0, protein: 0, starch: 0, dairy: 0 };
  for (const plates of byDay.values()) {
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

    const day = dayNutrients(plates);
    if (day.entriesCounted === 0) continue;
    daysWithData++;
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
  const dayCount = (key: NutrientKey): number => sums[key]?.days ?? 0;

  const daysLogged = byDay.size;
  const wentWell: WeeklyHighlight<WeeklyPositive>[] = [];
  let tryNext: WeeklyHighlight<WeeklySuggestion> | null = null;

  if (daysLogged >= MIN_DAYS_FOR_HIGHLIGHTS) {
    const { targets } = input;
    const trusted = (key: NutrientKey): number | undefined =>
      dayCount(key) >= MIN_DAYS_FOR_HIGHLIGHTS ? share(averages[key], targets[key]) : undefined;
    const protein = trusted('protein');
    const fibre = trusted('fibre');
    const salt = trusted('salt');
    const sugars = trusted('sugars');
    const vegShare = groupDays.veg / daysLogged;

    const positives: (WeeklyHighlight<WeeklyPositive> | null)[] = [
      vegShare >= 0.6
        ? { key: 'vegMostDays', params: { days: groupDays.veg, of: daysLogged } }
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

    if (vegShare < 0.5) {
      tryNext = { key: 'moreVeg', params: { days: groupDays.veg, of: daysLogged } };
    } else if (protein !== undefined && protein < 0.6) {
      tryNext = { key: 'moreProtein', params: { g: whole(averages.protein ?? 0) } };
    } else if (fibre !== undefined && fibre < 0.6) {
      tryNext = { key: 'moreFibre', params: { g: whole(averages.fibre ?? 0) } };
    } else if (salt !== undefined && salt >= 1) {
      tryNext = {
        key: 'easeSalt',
        params: { g: Math.round((averages.salt ?? 0) * 10) / 10 },
      };
    } else if (sugars !== undefined && sugars >= 1) {
      tryNext = { key: 'easeSugars', params: { g: whole(averages.sugars ?? 0) } };
    }
  }

  return {
    daysLogged,
    daysWithData,
    averages: Object.freeze(averages),
    estimated,
    groupDays,
    wentWell,
    tryNext,
  };
}
