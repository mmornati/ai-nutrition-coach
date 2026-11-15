/**
 * The goal- and energy-aware coach rules (lot 6, ADR 0008 decision 3). Pure, no AI.
 *
 * What they may say and when:
 *  - They read the person's DAILY GUIDE (a personal one only: a guide worked out from the EU
 *    reference intakes says nothing about this person) and only from totals the coverage model
 *    trusts (`isTotalPartial`): a day with a food that has no weight, or whose energy is unknown for
 *    more than `MAX_UNCOVERED_SHARE` of the weighed food, is never turned into a remark.
 *  - A day's energy is judged at DINNER or at the end of the day's last logged meal, never in the
 *    morning, and never while the person is pregnant or breastfeeding, or while a safeguard holds
 *    the guide at maintenance (the guide then says it does not know their needs).
 *  - They inform and ask. Well above the guide: name the foods that carried the energy and ask
 *    whether another amount or a swap would suit. Close to it: no energy remark at all. Well below
 *    it for a lose or gain goal: one gentle line that eating enough matters, never praise for
 *    eating little.
 *  - The satiety helpers (protein at the meal, vegetable volume, sugary drinks, alcohol) exist for
 *    the lose goal only, one at a time, and the two that name a food take it from what the person
 *    actually logs often, never from a generic list.
 */
import type { PlateLog } from '../entities/plate-log';
import type { Goal, Profile } from '../entities/profile';
import { dayNutrients, entryNutrients, isTotalPartial } from '../value-types/nutrient-totals';
import { ENERGY_FLOOR_KCAL, type DailyGuide } from '../value-types/daily-targets';
import type { GroupsOf } from './day-coaching';
import { slotOfPlate, storedGroupOnly, tallyPlate } from './day-coaching';
import { isAlcohol, isProcessedMeat, isSugaryDrink } from './food-detect';
import { foodNameConflicts } from './food-options';
import { isSameLocalDay } from '../value-types/calendar-day';
import type { MealSlot } from '../day/meal-slot';
import type { CoachSuggestion } from './nutrient-coaching';

/** The thresholds of the energy rules, shares of the daily guide's energy. Named, not magic. */
export const ENERGY_RULES = Object.freeze({
  /** A lose or gain goal: "well above" from here. */
  highShare: 1.15,
  /** Any other goal, or none: "far above" from here. */
  farHighShare: 1.3,
  /** A lose goal: "well below" up to here, at the end of the day with enough plates. */
  lowShare: 0.7,
  /** A gain goal: the mirror, a little higher because a surplus is the point. */
  gainLowShare: 0.8,
  /** A day needs this many plates before "below the guide" can mean anything. */
  minPlatesLow: 3,
  /** The named foods must carry at least this share of the day's energy together. */
  topFoodsShare: 0.35,
  /** A second food is named when it carries this share of the day's energy too. */
  secondFoodShare: 0.15,
  /** Energy quoted in a note is rounded to this many kcal. */
  roundKcal: 50,
  /** A sugary drink needs this much sugars in the entry (grams) and this many grams of drink. */
  drinkSugarsGrams: 10,
  drinkMinGrams: 150,
  /** An alcoholic drink needs this much energy in the entry to be mentioned. */
  alcoholKcal: 90,
  /** A food is "one you often have" from this many entries in the last 14 days. */
  ownFoodMinEntries: 2,
});

/** The goal the coach acts on, and the energy figure it compares a day with (if any). */
export interface GoalContext {
  /** The effective goal; `undefined` for none, or when a safeguard says the coach must not push it. */
  readonly goal: Goal | undefined;
  /** The personal guide's energy, kcal; absent when there is no personal guide or numbers are off. */
  readonly guideKcal?: number | undefined;
}

/** Safeguards of the guide under which the coach never pushes a weight goal (ADR 0008). */
const HOLDING_NOTICES = new Set([
  'underweight',
  'pregnancyBreastfeeding',
  'olderAdult',
  // A lose goal with no useful deficit above the floor, a weight goal with no body data, a gain
  // goal with a BMI of 30 or more: the guide is held at maintenance, so no weight talk either.
  'belowFloor',
  'bodyUnknown',
  'noSurplus',
]);

/**
 * The goal and the guide energy the rules may use. `numbersOn` false: no energy figure (every
 * energy line carries one). The goal is dropped to `undefined` when pregnant or breastfeeding, when
 * the guide is held for an underweight BMI or at 65 and over, so no weight talk follows.
 */
export function coachGoalContext(
  profile: Profile | undefined,
  guide: DailyGuide,
  numbersOn: boolean,
): GoalContext {
  const e = guide.explanation;
  const held =
    profile?.pregnantOrBreastfeeding === true ||
    (e.notice !== null && HOLDING_NOTICES.has(e.notice)) ||
    (e.customRefused !== null && HOLDING_NOTICES.has(e.customRefused as string));
  const goal = held ? undefined : profile?.goal;
  const energyOk = numbersOn && guide.personal && e.notice === null && !held;
  return { goal, ...(energyOk ? { guideKcal: guide.targets.energyKcal } : {}) };
}

const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

/** A name as a note shows it: one line, at most 40 characters. */
export function shortFoodName(name: string): string {
  const one = name.replace(/\s+/g, ' ').trim();
  return one.length > 40 ? `${one.slice(0, 39).trimEnd()}…` : one;
}

/** A day needs this many plates, or a dinner, before its energy can stand for the day. */
export const MIN_PLATES_FOR_DAY_ENERGY = 3;

/**
 * Whether a day's logging is wide enough for its energy to be read as the day's: at least three
 * plates, or a dinner. Two plates at breakfast and lunch are a partial day: a week built from such
 * days must not read as "well below", nor trigger "eat enough".
 */
export function dayCoversTheDay(plates: readonly PlateLog[]): boolean {
  return (
    plates.length >= MIN_PLATES_FOR_DAY_ENERGY || plates.some((p) => slotOfPlate(p) === 'dinner')
  );
}

/**
 * The day's energy when it can be trusted, else `null`: at least one counted entry, nothing
 * unweighed, and no more than `MAX_UNCOVERED_SHARE` of the weighed food without an energy value.
 */
export function trustedDayEnergy(
  plates: readonly PlateLog[],
): { readonly kcal: number; readonly estimated: boolean } | null {
  const day = dayNutrients(plates);
  const kcal = day.totals.energyKcal;
  if (day.entriesCounted === 0 || kcal === undefined || kcal <= 0) return null;
  if (isTotalPartial(day, 'energyKcal')) return null;
  return { kcal, estimated: day.estimated };
}

export interface EnergyFood {
  readonly name: string;
  readonly kcal: number;
}

/** The foods of the plates by energy, biggest first; the same name on several entries is one food. */
/**
 * `nameOf` names a food the way the caller reads it (the interface language); the default is the
 * stored display name.
 */
export function topEnergyFoods(
  plates: readonly PlateLog[],
  max = 3,
  nameOf?: (food: PlateLog['entries'][number]['databaseFood']) => string,
): readonly EnergyFood[] {
  const byName = new Map<string, { name: string; kcal: number }>();
  for (const plate of plates) {
    for (const entry of plate.entries) {
      const kcal = entryNutrients(entry)?.energyKcal;
      if (kcal === undefined || kcal <= 0) continue;
      const name = shortFoodName(
        nameOf === undefined ? entry.databaseFood.displayName : nameOf(entry.databaseFood),
      );
      const key = name.toLowerCase();
      const acc = byName.get(key) ?? { name, kcal: 0 };
      acc.kcal += kcal;
      byName.set(key, acc);
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.kcal - a.kcal || a.name.localeCompare(b.name))
    .slice(0, max);
}

/**
 * Whether judging the DAY is in order for this plate: it is the day's latest plate and it is
 * dinner, or a snack or late plate once the day already had a dinner, or a late plate when the day
 * is over (from 21:00 to 04:59). A 17:30 snack is not the end of the day. Never mid-morning, never
 * at lunch.
 */
export function isEndOfDay(
  plate: PlateLog,
  slot: MealSlot,
  others: readonly PlateLog[],
  slotOf: (p: PlateLog) => MealSlot,
): boolean {
  if (others.some((p) => p.loggedAtUtc > plate.loggedAtUtc)) return false;
  if (slot === 'dinner') return true;
  if (slot === 'late' || slot === 'snack') {
    if (others.some((p) => slotOf(p) === 'dinner')) return true;
    const hour = new Date(plate.loggedAtUtc).getHours();
    return slot === 'late' && (hour >= 21 || hour < 5);
  }
  return false;
}

/**
 * The day-energy remark for the plate that closes the day, or none. `dayPlates` are the day's
 * plates INCLUDING this one.
 */
export function dayEnergySuggestion(input: {
  readonly dayPlates: readonly PlateLog[];
  readonly goal: GoalContext;
}): CoachSuggestion | null {
  const { guideKcal, goal } = input.goal;
  if (guideKcal === undefined || guideKcal <= 0) return null;
  const energy = trustedDayEnergy(input.dayPlates);
  if (energy === null) return null;
  const share = energy.kcal / guideKcal;
  const weightGoal = goal === 'lose' || goal === 'gain';
  const high = weightGoal && goal === 'lose' ? ENERGY_RULES.highShare : ENERGY_RULES.farHighShare;
  const est = energy.estimated ? 1 : 0;
  if (share >= high) {
    const top = topEnergyFoods(input.dayPlates, 2);
    const first = top[0];
    if (first === undefined) return null;
    const second = top[1];
    const withSecond =
      second !== undefined && second.kcal / energy.kcal >= ENERGY_RULES.secondFoodShare;
    const named = withSecond ? first.kcal + second.kcal : first.kcal;
    if (named / energy.kcal < ENERGY_RULES.topFoodsShare) return null;
    return {
      pattern: 'energyHighDay',
      params: {
        food: first.name,
        ...(withSecond && second !== undefined ? { food2: second.name } : {}),
        kcal: roundTo(named, ENERGY_RULES.roundKcal),
        est,
      },
    };
  }
  const lowLimit = goal === 'lose' ? ENERGY_RULES.lowShare : ENERGY_RULES.gainLowShare;
  if (weightGoal && share <= lowLimit && input.dayPlates.length >= ENERGY_RULES.minPlatesLow) {
    return { pattern: 'energyLowDay', params: { pct: Math.round(share * 100), est } };
  }
  return null;
}

/** The names of the foods the person logs often in a group, from their recent plates. */
export function ownFoods(input: {
  readonly history: readonly PlateLog[];
  readonly group: 'protein' | 'vegFruit';
  readonly groupsOf?: GroupsOf | undefined;
  readonly profile?: Profile | undefined;
  /** Names already on the plate: not offered back. */
  readonly exclude?: readonly string[];
  readonly max?: number;
}): readonly string[] {
  const groupsOf = input.groupsOf ?? storedGroupOnly;
  const skip = new Set((input.exclude ?? []).map((n) => n.toLowerCase()));
  const counts = new Map<string, { name: string; n: number }>();
  for (const plate of input.history) {
    for (const entry of plate.entries) {
      const food = entry.databaseFood;
      if (!groupsOf(food).includes(input.group)) continue;
      if (isProcessedMeat(food) || isAlcohol(food) || isSugaryDrink(food)) continue;
      const name = shortFoodName(food.displayName);
      if (name.length === 0 || foodNameConflicts(name, input.profile)) continue;
      const key = name.toLowerCase();
      if (skip.has(key)) continue;
      const acc = counts.get(key) ?? { name, n: 0 };
      acc.n++;
      counts.set(key, acc);
    }
  }
  return [...counts.values()]
    .filter((c) => c.n >= ENERGY_RULES.ownFoodMinEntries)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, input.max ?? 1)
    .map((c) => c.name);
}

export interface SatietyInput {
  readonly plate: PlateLog;
  readonly slot: MealSlot;
  readonly goal: GoalContext;
  /** Show figures (grams of sugars). Off: the note carries none. */
  readonly figures: boolean;
  /** The person's recent plates, for the foods they often have. */
  readonly history?: readonly PlateLog[] | undefined;
  readonly groupsOf?: GroupsOf | undefined;
  readonly profile?: Profile | undefined;
}

/**
 * The satiety helpers of a lose goal, best first: a sugary drink, an alcoholic drink, protein at
 * the meal, vegetable volume. The caller takes the first that is not the day's previous pattern.
 */
export function satietySuggestions(input: SatietyInput): readonly CoachSuggestion[] {
  if (input.goal.goal !== 'lose' || input.slot === 'late') return [];
  const { plate } = input;
  const out: CoachSuggestion[] = [];

  let drink: { name: string; sugars: number; estimated: boolean } | null = null;
  let alcohol: string | null = null;
  for (const entry of plate.entries) {
    const food = entry.databaseFood;
    const n = entryNutrients(entry);
    const grams = entry.quantity.grams;
    if (isSugaryDrink(food) && n?.sugars !== undefined && grams !== undefined) {
      if (
        grams >= ENERGY_RULES.drinkMinGrams &&
        n.sugars >= ENERGY_RULES.drinkSugarsGrams &&
        (drink === null || n.sugars > drink.sugars)
      ) {
        drink = {
          name: shortFoodName(food.displayName),
          sugars: n.sugars,
          estimated:
            entry.quantity.gramsEstimated === true || food.extra?.nutrientsEstimated === true,
        };
      }
    } else if (isAlcohol(food) && alcohol === null) {
      const kcal = n?.energyKcal;
      if (kcal !== undefined && kcal >= ENERGY_RULES.alcoholKcal) {
        alcohol = shortFoodName(food.displayName);
      }
    }
  }
  if (drink !== null) {
    out.push({
      pattern: 'sugaryDrink',
      params: input.figures
        ? { food: drink.name, g: Math.round(drink.sugars), est: drink.estimated ? 1 : 0 }
        : { food: drink.name, nonum: 1 },
    });
  }
  if (alcohol !== null) out.push({ pattern: 'alcoholDrink', params: { food: alcohol } });

  if (input.slot === 'lunch' || input.slot === 'dinner') {
    const tally = tallyPlate(plate, input.groupsOf ?? storedGroupOnly);
    const onPlate = plate.entries.map((e) => e.databaseFood.displayName);
    const history = input.history ?? [];
    if (tally.protein === 0 && tally.starch + tally.veg + tally.dairy > 0) {
      const [food] = ownFoods({
        history,
        group: 'protein',
        groupsOf: input.groupsOf,
        profile: input.profile,
        exclude: onPlate,
      });
      if (food !== undefined) out.push({ pattern: 'proteinPlateLose', params: { food } });
    }
    if (tally.veg === 0 && tally.protein + tally.starch > 0) {
      const [food] = ownFoods({
        history,
        group: 'vegFruit',
        groupsOf: input.groupsOf,
        profile: input.profile,
        exclude: onPlate,
      });
      if (food !== undefined) out.push({ pattern: 'vegVolumeLose', params: { food } });
    }
  }
  return out;
}

/** The plates of the same local day as `plate`, from a longer list (used to scope the history). */
export const platesOfDay = (plate: PlateLog, plates: readonly PlateLog[]): readonly PlateLog[] =>
  plates.filter((p) => isSameLocalDay(p.loggedAtUtc, plate.loggedAtUtc));

/**
 * What the output validator needs about this person (`CoachTextRules`): whether talk of losing
 * weight is allowed (only for a lose or gain goal the coach may act on), the person's energy floor
 * and, for a personal guide, the guide itself. These are safety guards, so they do not depend on
 * whether numbers are shown.
 */
export function coachTextLimits(
  profile: Profile | undefined,
  guide: DailyGuide,
  goal: GoalContext,
): {
  readonly weightTalk: 'allowed' | 'restrained';
  readonly floorKcal: number;
  readonly guideKcal?: number;
} {
  // A guide held at maintenance by a safeguard is still the figure to compare with: "aim for 1,300
  // kcal a day" is refused for such a person too (the floor alone would let it through).
  return {
    weightTalk: goal.goal === 'lose' || goal.goal === 'gain' ? 'allowed' : 'restrained',
    floorKcal: ENERGY_FLOOR_KCAL[profile?.sex ?? 'unspecified'],
    ...(guide.personal ? { guideKcal: guide.targets.energyKcal } : {}),
  };
}
