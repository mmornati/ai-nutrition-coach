import type { EpochMs } from '../common';
import type { PlateLog } from '../entities/plate-log';
import type { Profile } from '../entities/profile';
import { startOfLocalDay } from '../value-types/calendar-day';
import { MAX_UNCOVERED_SHARE, dayNutrients, entryNutrients } from '../value-types/nutrient-totals';
import { NUTRIENT_KEYS, type NutrientKey, type Nutrients } from '../value-types/nutrients';
import type { TrendChange } from '../value-types/weight-trend';
import { storedGroupOnly, tallyPlate, type GroupsOf } from './day-coaching';
import {
  dayCoversTheDay,
  shortFoodName,
  trustedDayEnergy,
  type GoalContext,
} from './energy-coaching';
import { foodKinds } from './food-detect';
import { restrictionsOf, slotOptions } from './food-options';
import { reviewStep, type CoachStep, type StepId, type StepReview } from './step';

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
  // The goal- and energy-aware ones (lot 6).
  'easeEnergy',
  'eatEnough',
  'lessSugaryDrinks',
] as const;
export type WeeklySuggestion = (typeof WEEKLY_SUGGESTIONS)[number];

/**
 * The food-quality observations (PNNS-style, France's public-health guidance): neutral, low
 * frequency, one at most per review, each from what the food names can support reliably.
 */
export const WEEKLY_QUALITY = [
  'processedMeatOften',
  'redMeatOften',
  'sugaryDrinksOften',
  'pulsesLow',
  'fishLow',
  'wholegrainLow',
  'nutsNone',
] as const;
export type WeeklyQuality = (typeof WEEKLY_QUALITY)[number];

export interface WeeklyHighlight<K extends string> {
  readonly key: K;
  /** Raw numbers for the copy (`days`, `of`, `g`, `pct`) and a `food` name. Formatted at display time. */
  readonly params: Readonly<Record<string, number | string>>;
}

/** How a week's average energy sits against the daily guide, in words the copy can use. */
export type EnergyRelation = 'near' | 'above' | 'farAbove' | 'below' | 'farBelow';

export interface WeeklyEnergy {
  /** Per-day average energy over the counted days whose energy is trusted, kcal. */
  readonly avgKcal: number;
  readonly guideKcal: number;
  /** How many days the average is drawn from (at least `MIN_DAYS_FOR_HIGHLIGHTS`). */
  readonly days: number;
  readonly relation: EnergyRelation;
  readonly estimated: boolean;
}

/** A weight trend over about four weeks, said descriptively next to the logged energy. */
export interface WeeklyWeightLine {
  readonly direction: 'lower' | 'higher' | 'steady';
  /** The size of the change, kg, one decimal. */
  readonly kg: number;
  /** The days it spans. */
  readonly days: number;
  /** The logged energy against the guide, or `unknown` when it cannot be said. */
  readonly intake: 'near' | 'above' | 'below' | 'unknown';
  /** The trend and the log disagree about the goal: said calmly, with the usual reasons. */
  readonly mismatch: boolean;
}

/** The thresholds of the week's energy and quality lines. Named, not magic. */
export const WEEK_RULES = Object.freeze({
  nearLow: 0.9,
  nearHigh: 1.1,
  /** From here a lose or gain goal reads "above". */
  aboveShare: 1.15,
  farAboveShare: 1.3,
  farBelowShare: 0.75,
  /** The trend and a log that disagree: logged under this share of the guide, yet no loss. */
  mismatchBelowShare: 0.85,
  /** A weight change under this many kg is "about the same". */
  steadyKg: 0.2,
  /** The change spans at least this many days to be called a four-week trend. */
  minTrendDays: 21,
  denseKcalPer100: 250,
  recurringDays: 2,
  /** Quality rules need this many logged days in the week. */
  qualityMinDays: 5,
  processedDays: 4,
  redMeatDays: 4,
  sugaryDrinkDays: 3,
  pulsesDays: 2,
  fishDays: 2,
  wholegrainShare: 0.25,
  wholegrainMinEntries: 6,
});

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
  /** The week's average energy against the personal guide; `null` without one or without enough trusted days. */
  readonly energy: WeeklyEnergy | null;
  /** The recurring, energy-dense foods of the counted days, biggest contribution first (at most 3). */
  readonly energyFoods: readonly string[];
  /** At most one neutral food-quality observation. */
  readonly quality: WeeklyHighlight<WeeklyQuality> | null;
  /** What the logged meals show about the accepted step, when they can show anything. */
  readonly stepReview: StepReview | null;
  /** The weight trend next to the logged energy, for a lose or gain goal; `null` otherwise. */
  readonly weightLine: WeeklyWeightLine | null;
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
  /** The goal and the personal guide's energy (`coachGoalContext`); absent: no energy or weight lines. */
  readonly goal?: GoalContext | undefined;
  /** For diet and allergy limits on the food-quality lines. */
  readonly profile?: Profile | undefined;
  /** The step the person accepted, when there is one. */
  readonly step?: CoachStep | null | undefined;
  /** The weight trend over about four weeks (`trendChange`), when the person has weigh-ins. */
  readonly weightChange?: TrendChange | null | undefined;
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
  const energyDays: { kcal: number; estimated: boolean }[] = [];
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
    const trusted = trustedDayEnergy(plates);
    // The week's energy line reads only days that look like whole days (completeness above, and
    // at least three plates or a dinner): partial logging must not read as "well below".
    if (trusted !== null && dayCoversTheDay(plates)) energyDays.push(trusted);
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
  const goal = input.goal;
  const energy = weekEnergy(energyDays, goal?.guideKcal);
  const energyFoods = recurringEnergyFoods(byDay, countedPlates);
  const kinds = weekKinds(input.plates);
  const sugaryDrinkDays = kinds.sugaryDays;
  const wentWell: WeeklyHighlight<WeeklyPositive>[] = [];
  let tryNext: WeeklyHighlight<WeeklySuggestion> | null = null;

  if (daysLogged >= MIN_DAYS_FOR_HIGHLIGHTS) {
    const { targets } = input;
    const dairyOpen = slotOptions('dairy', input.profile).length > 0;
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
      // Said only when the diet and allergies leave dairy open: the line names it.
      dairyOpen &&
      Math.min(groupDays.veg, groupDays.protein, groupDays.starch, groupDays.dairy) >= 2
        ? { key: 'variedWeek', params: { of: daysLogged } }
        : null,
    ];
    for (const p of positives) {
      if (p !== null && wentWell.length < 2) wentWell.push(p);
    }

    const goalName = input.goal?.goal;
    const dayCount2 = energy === null ? 0 : energy.days;
    const share2 = energy === null ? undefined : energy.avgKcal / energy.guideKcal;
    const heavy = share2 !== undefined && dayCount2 >= MIN_DAYS_FOR_HIGHLIGHTS;
    const weightGoal = goalName === 'lose' || goalName === 'gain';
    const eatEnough =
      heavy && weightGoal && share2 <= (goalName === 'gain' ? 0.8 : WEEK_RULES.farBelowShare);
    const easeEnergy =
      heavy &&
      energyFoods.length > 0 &&
      share2 >= (goalName === 'lose' ? WEEK_RULES.aboveShare : WEEK_RULES.farAboveShare);
    const energyTry: WeeklyHighlight<WeeklySuggestion> | null = eatEnough
      ? { key: 'eatEnough', params: { pct: Math.round(share2 * 100) } }
      : easeEnergy
        ? {
            key: 'easeEnergy',
            params: {
              food: energyFoods[0] ?? '',
              kcal: Math.round((energy?.avgKcal ?? 0) / 50) * 50,
            },
          }
        : null;
    const drinks: WeeklyHighlight<WeeklySuggestion> | null =
      sugaryDrinkDays >= WEEK_RULES.sugaryDrinkDays
        ? { key: 'lessSugaryDrinks', params: { days: sugaryDrinkDays, of: daysLogged } }
        : null;

    let base: WeeklyHighlight<WeeklySuggestion> | null = null;
    if (vegShare !== undefined && vegShare < 0.5) {
      base = { key: 'moreVeg', params: { days: vegCounted, of: countedDays } };
    } else if (protein !== undefined && protein < 0.6) {
      base = { key: 'moreProtein', params: { g: whole(averages.protein ?? 0) } };
    } else if (fibre !== undefined && fibre < 0.6) {
      base = { key: 'moreFibre', params: { g: whole(averages.fibre ?? 0) } };
    } else if (saltAtLeast !== undefined && saltAtLeast >= 1) {
      base = { key: 'easeSalt', params: { g: Math.round((averages.salt ?? 0) * 10) / 10 } };
    } else if (sugarsAtLeast !== undefined && sugarsAtLeast >= 1) {
      base = { key: 'easeSugars', params: { g: whole(averages.sugars ?? 0) } };
    }
    // With a weight goal the energy lines come first; for any other goal only a far-above week
    // does, and the older rules keep their place otherwise.
    if (goalName === 'lose') tryNext = energyTry ?? drinks ?? base;
    else if (goalName === 'gain')
      tryNext = energyTry?.key === 'eatEnough' ? energyTry : (base ?? drinks);
    else tryNext = easeEnergy ? energyTry : (base ?? drinks);
  }

  const quality =
    daysLogged >= WEEK_RULES.qualityMinDays && countedDays >= MIN_DAYS_FOR_HIGHLIGHTS
      ? qualityObservation(kinds, daysLogged, input.profile, tryNext)
      : null;
  const stepReview =
    input.step === undefined || input.step === null
      ? null
      : reviewStep({
          step: input.step,
          plates: input.plates,
          today: input.today,
          groupsOf: input.groupsOf,
        });
  const weightLine = weeklyWeightLine(input.weightChange, goal, energy);

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
    energy,
    energyFoods,
    quality,
    stepReview,
    weightLine,
  };
}

/** The relation of an average to the guide, in the words the copy uses. */
export function energyRelation(share: number, goal: GoalContext['goal']): EnergyRelation {
  if (share >= WEEK_RULES.farAboveShare) return 'farAbove';
  if (share > WEEK_RULES.nearHigh) return 'above';
  if (share < WEEK_RULES.farBelowShare && (goal === 'lose' || goal === 'gain')) return 'farBelow';
  if (share < WEEK_RULES.nearLow) return share < WEEK_RULES.farBelowShare ? 'farBelow' : 'below';
  return 'near';
}

function weekEnergy(
  days: readonly { kcal: number; estimated: boolean }[],
  guideKcal: number | undefined,
): WeeklyEnergy | null {
  if (guideKcal === undefined || guideKcal <= 0 || days.length < MIN_DAYS_FOR_HIGHLIGHTS)
    return null;
  const avg = days.reduce((n, d) => n + d.kcal, 0) / days.length;
  return {
    avgKcal: Math.round(avg / 10) * 10,
    guideKcal: Math.round(guideKcal / 10) * 10,
    days: days.length,
    relation: energyRelation(avg / guideKcal, undefined),
    estimated: days.some((d) => d.estimated),
  };
}

/**
 * Foods that came up on at least two counted days and are energy-dense (250 kcal per 100 g or
 * more), by their total energy over the week: the ones a swap or a smaller portion would move.
 */
function recurringEnergyFoods(
  byDay: ReadonlyMap<number, readonly PlateLog[]>,
  countedPlates: readonly PlateLog[],
): readonly string[] {
  const counted = new Set(countedPlates);
  const foods = new Map<string, { name: string; kcal: number; days: Set<number> }>();
  for (const [day, plates] of byDay) {
    for (const plate of plates) {
      if (!counted.has(plate)) continue;
      for (const entry of plate.entries) {
        const per100 = entry.databaseFood.nutrientsPer100g?.energyKcal;
        const kcal = entryNutrients(entry)?.energyKcal;
        if (per100 === undefined || kcal === undefined || per100 < WEEK_RULES.denseKcalPer100)
          continue;
        const name = shortFoodName(entry.databaseFood.displayName);
        const key = name.toLowerCase();
        const acc = foods.get(key) ?? { name, kcal: 0, days: new Set<number>() };
        acc.kcal += kcal;
        acc.days.add(day);
        foods.set(key, acc);
      }
    }
  }
  return [...foods.values()]
    .filter((f) => f.days.size >= WEEK_RULES.recurringDays)
    .sort((a, b) => b.kcal - a.kcal || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((f) => f.name);
}

interface WeekKinds {
  readonly processedDays: number;
  readonly redDays: number;
  readonly sugaryDays: number;
  readonly pulseDays: number;
  readonly fishDays: number;
  readonly nutDays: number;
  readonly cerealEntries: number;
  readonly wholegrainEntries: number;
}

/** Days with each kind of food across every logged day of the week (see `food-detect.ts`). */
function weekKinds(plates: readonly PlateLog[]): WeekKinds {
  const days = {
    processed: new Set<number>(),
    red: new Set<number>(),
    sugary: new Set<number>(),
    pulse: new Set<number>(),
    fish: new Set<number>(),
    nut: new Set<number>(),
  };
  let cerealEntries = 0;
  let wholegrainEntries = 0;
  for (const plate of plates) {
    const day = startOfLocalDay(plate.loggedAtUtc);
    for (const entry of plate.entries) {
      const k = foodKinds(entry.databaseFood);
      if (k.processedMeat) days.processed.add(day);
      if (k.redMeat) days.red.add(day);
      if (k.sugaryDrink) days.sugary.add(day);
      if (k.pulse) days.pulse.add(day);
      if (k.fish) days.fish.add(day);
      if (k.nut) days.nut.add(day);
      if (k.cerealStarch) {
        cerealEntries++;
        if (k.wholegrain) wholegrainEntries++;
      }
    }
  }
  return {
    processedDays: days.processed.size,
    redDays: days.red.size,
    sugaryDays: days.sugary.size,
    pulseDays: days.pulse.size,
    fishDays: days.fish.size,
    nutDays: days.nut.size,
    cerealEntries,
    wholegrainEntries,
  };
}

/**
 * At most one food-quality observation, in this order: processed meat on 4 or more days, red meat
 * on 4 or more, sugary drinks on 3 or more, pulses on fewer than 2 days, fish on fewer than 2
 * (skipped for vegetarian, vegan and a fish allergy), wholegrain starches under a quarter of the
 * cereal starches (6 or more logged; skipped when no wholegrain option suits the person), no nuts
 * at all (skipped for a nut allergy). A topic the "try next week" line already covers is not
 * repeated.
 */
function qualityObservation(
  k: WeekKinds,
  daysLogged: number,
  profile: Profile | undefined,
  tryNext: WeeklyHighlight<WeeklySuggestion> | null,
): WeeklyHighlight<WeeklyQuality> | null {
  const restrictions = restrictionsOf(profile);
  const diet = profile?.diet ?? 'omnivore';
  const eatsFish =
    (diet === 'omnivore' || diet === 'pescatarian') && !restrictions.families.has('fish');
  const nutsOk = !restrictions.families.has('nuts');
  const days = (n: number) => ({ days: n, of: daysLogged });
  const meatOk = !restrictions.families.has('meat');
  if (meatOk && k.processedDays >= WEEK_RULES.processedDays) {
    return { key: 'processedMeatOften', params: days(k.processedDays) };
  }
  if (meatOk && k.redDays >= WEEK_RULES.redMeatDays) {
    return { key: 'redMeatOften', params: days(k.redDays) };
  }
  if (k.sugaryDays >= WEEK_RULES.sugaryDrinkDays && tryNext?.key !== 'lessSugaryDrinks') {
    return { key: 'sugaryDrinksOften', params: days(k.sugaryDays) };
  }
  if (k.pulseDays < WEEK_RULES.pulsesDays && slotOptions('pulses', profile).length > 0) {
    return { key: 'pulsesLow', params: days(k.pulseDays) };
  }
  if (eatsFish && k.fishDays < WEEK_RULES.fishDays)
    return { key: 'fishLow', params: days(k.fishDays) };
  if (
    k.cerealEntries >= WEEK_RULES.wholegrainMinEntries &&
    k.wholegrainEntries / k.cerealEntries < WEEK_RULES.wholegrainShare &&
    slotOptions('wholegrain', profile).length > 0
  ) {
    return { key: 'wholegrainLow', params: { n: k.wholegrainEntries, of: k.cerealEntries } };
  }
  if (nutsOk && k.nutDays === 0) return { key: 'nutsNone', params: { of: daysLogged } };
  return null;
}

function weeklyWeightLine(
  change: TrendChange | null | undefined,
  goal: GoalContext | undefined,
  energy: WeeklyEnergy | null,
): WeeklyWeightLine | null {
  if (change === null || change === undefined) return null;
  if (goal?.goal !== 'lose' && goal?.goal !== 'gain') return null;
  if (change.days < WEEK_RULES.minTrendDays) return null;
  const direction =
    change.kg <= -WEEK_RULES.steadyKg
      ? 'lower'
      : change.kg >= WEEK_RULES.steadyKg
        ? 'higher'
        : 'steady';
  const share = energy === null ? undefined : energy.avgKcal / energy.guideKcal;
  const intake =
    share === undefined
      ? 'unknown'
      : share > WEEK_RULES.nearHigh
        ? 'above'
        : share < WEEK_RULES.nearLow
          ? 'below'
          : 'near';
  const mismatch =
    share !== undefined &&
    ((goal.goal === 'lose' && share <= WEEK_RULES.mismatchBelowShare && direction !== 'lower') ||
      (goal.goal === 'gain' && share >= WEEK_RULES.nearHigh && direction !== 'higher'));
  return {
    direction,
    kg: Math.round(Math.abs(change.kg) * 10) / 10,
    days: change.days,
    intake,
    mismatch,
  };
}

/** The step id a week-review line can offer, or `null`. */
export function stepOfferForWeekly(
  key: WeeklySuggestion | WeeklyQuality,
  params: Readonly<Record<string, number | string>> = {},
): { readonly id: StepId; readonly food?: string } | null {
  switch (key) {
    case 'moreVeg':
      return { id: 'vegAtLunch' };
    case 'lessSugaryDrinks':
    case 'sugaryDrinksOften':
      return { id: 'waterForDrinks' };
    case 'easeEnergy': {
      const food = typeof params['food'] === 'string' ? params['food'] : '';
      return food === '' ? null : { id: 'smallerPortion', food: food.slice(0, 40) };
    }
    case 'pulsesLow':
      return { id: 'pulsesWeek' };
    case 'fishLow':
      return { id: 'fishWeek' };
    case 'wholegrainLow':
      return { id: 'wholegrainWeek' };
    case 'nutsNone':
      return { id: 'nutsWeek' };
    case 'moreProtein':
      return { id: 'proteinAtLunch' };
    default:
      return null;
  }
}
