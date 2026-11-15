import type { PlateLog } from '../entities/plate-log';
import type { Profile } from '../entities/profile';
import type { MealSlot } from '../day/meal-slot';
import type { CoachParams, CompositionPattern } from '../value-types/composition-pattern';
import { dayNutrients, entryNutrients, plateNutrients } from '../value-types/nutrient-totals';
import type { Nutrients } from '../value-types/nutrients';
import {
  applicablePatterns,
  openPlatePatternFor,
  otherPlatesOfSameDay,
  slotOfPlate,
  storedGroupOnly,
  tallyPlate,
  type CoachPatternContext,
  type GroupsOf,
} from './day-coaching';
import {
  dayEnergySuggestion,
  isEndOfDay,
  satietySuggestions,
  type GoalContext,
} from './energy-coaching';
import { PATTERN_SLOTS, slotOptions, slotParams } from './food-options';

/** A pattern and the raw numbers its copy interpolates. */
export interface CoachSuggestion {
  readonly pattern: CompositionPattern;
  readonly params: CoachParams;
}

/**
 * The thresholds of the nutrient rules. Shares of the day's reference (`targets`), except
 * `sugarsItemGrams` (grams of sugars in one entry) and `energyDenseKcal`.
 */
export const NUTRIENT_RULE_THRESHOLDS = Object.freeze({
  sugarsItemGrams: 15,
  saltPlateShare: 0.4,
  satFatPlateShare: 0.5,
  energyDenseKcal: 400,
  proteinDayShare: 0.35,
  fibreDayShare: 0.4,
});

export interface NutrientRuleInput {
  readonly plate: PlateLog;
  readonly slot: MealSlot;
  /** The plate's other local-day plates (the plate itself excluded). */
  readonly earlierPlates: readonly PlateLog[];
  readonly targets: Required<Nutrients>;
  readonly groupsOf?: GroupsOf | undefined;
}

/** One decimal, so the stored params stay short; display rounds again. */
const EPS = 1e-9;
const r1 = (n: number): number => Math.round(n * 10) / 10;
const pct = (value: number, target: number): number => Math.round((value / target) * 100);
/** `zero: 1` asks for the plain "none logged" wording instead of a number. */
const dayParams = (value: number, target: number, estimated: boolean): CoachParams =>
  r1(value) === 0 ? { zero: 1 } : { g: r1(value), pct: pct(value, target), est: est(estimated) };
const est = (estimated: boolean): number => (estimated ? 1 : 0);

/**
 * True when every entry of the plates has the nutrient known (a weight and a value). A day total
 * that leaves an unknown entry out would understate the nutrient, so "low" is only ever said
 * when nothing is missing.
 */
function knownForAll(plates: readonly PlateLog[], key: 'protein' | 'fibre'): boolean {
  return plates.every((p) => p.entries.every((e) => entryNutrients(e)?.[key] !== undefined));
}

/** The "day so far" rules, protein first. `plates` are the whole day so far. */
function daySoFarSuggestions(
  slot: MealSlot,
  plates: readonly PlateLog[],
  targets: Required<Nutrients>,
): readonly CoachSuggestion[] {
  if (slot !== 'lunch' && slot !== 'dinner') return [];
  const day = dayNutrients(plates);
  if (day.entriesCounted === 0) return [];
  const out: CoachSuggestion[] = [];
  const protein = day.totals.protein;
  if (
    protein !== undefined &&
    knownForAll(plates, 'protein') &&
    protein < NUTRIENT_RULE_THRESHOLDS.proteinDayShare * targets.protein
  ) {
    out.push({
      pattern: 'proteinLowDay',
      params: dayParams(protein, targets.protein, day.estimated),
    });
  }
  const fibre = day.totals.fibre;
  if (
    slot === 'dinner' &&
    fibre !== undefined &&
    knownForAll(plates, 'fibre') &&
    fibre < NUTRIENT_RULE_THRESHOLDS.fibreDayShare * targets.fibre
  ) {
    out.push({
      pattern: 'fibreLowDay',
      params: dayParams(fibre, targets.fibre, day.estimated),
    });
  }
  return out;
}

/**
 * The nutrient-driven suggestions that apply to a plate, best first. Empty means no nutrient rule
 * fired (or there is no data), and the food-group patterns take over. Unknown is never zero: a
 * rule whose nutrient is missing from the data does not fire.
 *
 *   rule              slots                      fires when
 *   sugarsHighItem    breakfast, lunch, dinner   one entry has >= 15 g sugars
 *   saltHighPlate     breakfast, lunch, dinner   plate salt >= 40% of the day's guide
 *   satFatHighPlate   breakfast, lunch, dinner   plate saturated fat >= 50% of the guide
 *   energyDenseSnack  late, snack                plate >= 400 kcal with no protein or veg entry
 *   proteinLowDay     lunch, dinner              day protein (with this plate) < 35% of the guide
 *   fibreLowDay       dinner                     day fibre (with this plate) < 40% of the guide
 *
 * A late plate or a snack says nothing except `energyDenseSnack`.
 */
export function applicableNutrientSuggestions(
  input: NutrientRuleInput,
): readonly CoachSuggestion[] {
  const { plate, slot, earlierPlates, targets } = input;
  const plateTotals = plateNutrients(plate);
  if (plateTotals.entriesCounted === 0) return [];
  const out: CoachSuggestion[] = [];
  const t = plateTotals.totals;

  if (slot !== 'late' && slot !== 'snack') {
    let top: { food: string; sugars: number; estimated: boolean } | null = null;
    for (const entry of plate.entries) {
      const sugars = entryNutrients(entry)?.sugars;
      if (sugars === undefined || sugars < NUTRIENT_RULE_THRESHOLDS.sugarsItemGrams) continue;
      if (top === null || sugars > top.sugars) {
        top = {
          food: entry.databaseFood.displayName,
          sugars,
          estimated:
            entry.quantity.gramsEstimated === true ||
            entry.databaseFood.extra?.nutrientsEstimated === true,
        };
      }
    }
    if (top !== null) {
      out.push({
        pattern: 'sugarsHighItem',
        params: {
          food: top.food,
          g: r1(top.sugars),
          pct: pct(top.sugars, targets.sugars),
          est: est(top.estimated),
        },
      });
    }
    if (
      t.salt !== undefined &&
      t.salt >= NUTRIENT_RULE_THRESHOLDS.saltPlateShare * targets.salt - EPS
    ) {
      out.push({
        pattern: 'saltHighPlate',
        params: { g: r1(t.salt), pct: pct(t.salt, targets.salt), est: est(plateTotals.estimated) },
      });
    }
    if (
      t.saturatedFat !== undefined &&
      t.saturatedFat >= NUTRIENT_RULE_THRESHOLDS.satFatPlateShare * targets.saturatedFat - EPS
    ) {
      out.push({
        pattern: 'satFatHighPlate',
        params: {
          g: r1(t.saturatedFat),
          pct: pct(t.saturatedFat, targets.saturatedFat),
          est: est(plateTotals.estimated),
        },
      });
    }
  } else if (
    // A late plate or a snack: only the energy-dense snack remark.
    t.energyKcal !== undefined &&
    t.energyKcal >= NUTRIENT_RULE_THRESHOLDS.energyDenseKcal
  ) {
    const tally = tallyPlate(plate, input.groupsOf ?? storedGroupOnly);
    if (tally.protein === 0 && tally.veg === 0) {
      out.push({
        pattern: 'energyDenseSnack',
        params: { kcal: Math.round(t.energyKcal), est: est(plateTotals.estimated) },
      });
    }
  }

  out.push(...daySoFarSuggestions(slot, [...earlierPlates, plate], targets));
  return out;
}

export interface CoachSuggestionContext extends CoachPatternContext {
  /** The day's reference amounts; without them the nutrient layer is off (numbers turned off). */
  readonly targets?: Required<Nutrients> | undefined;
  /** The goal and the personal guide's energy (lot 6). Absent: no goal- or energy-aware rule. */
  readonly goal?: GoalContext | undefined;
  /** The person's recent plates (about 14 days), for "a food you often have". */
  readonly history?: readonly PlateLog[] | undefined;
  /** The diet and allergies every food named in a note respects. */
  readonly profile?: Profile | undefined;
}

/**
 * Adds the food-slot options (`protein=eggs.beans`) a pattern's copy names, chosen under the
 * person's diet and allergies, so the note reads the same later and never names a food they avoid.
 */
export function withFoodSlots(
  suggestion: CoachSuggestion,
  profile: Profile | undefined,
): CoachSuggestion {
  const slots = PATTERN_SLOTS[suggestion.pattern];
  if (slots === undefined) return suggestion;
  return { ...suggestion, params: { ...suggestion.params, ...slotParams(slots, profile) } };
}

/** Whether the person's diet or allergies leave nothing to name: the pattern is then not said. */
const unusable = (pattern: CompositionPattern, profile: Profile | undefined): boolean =>
  pattern === 'dairyLight' && slotOptions('dairy', profile).length === 0;

/**
 * The one suggestion for a freshly logged plate, in this order: the goal and energy layer (the
 * day's energy against the personal guide at the end of the day, the satiety helpers of a lose
 * goal), then a nutrient rule, then the food-group pattern. Skips the day's previous pattern;
 * `null` is silence. Every food a note names respects `profile.diet` and `profile.allergies`.
 */
export function coachSuggestionFor(
  plate: PlateLog,
  context: CoachSuggestionContext = {},
): CoachSuggestion | null {
  const previous = context.previousPattern ?? null;
  const slot = slotOfPlate(plate);
  const others = otherPlatesOfSameDay(plate, context.dayPlates ?? []);
  const candidates: CoachSuggestion[] = [];

  const goal = context.goal;
  if (goal !== undefined) {
    if (goal.guideKcal !== undefined && isEndOfDay(plate, slot, others, slotOfPlate)) {
      const day = dayEnergySuggestion({ dayPlates: [...others, plate], goal });
      if (day !== null) candidates.push(day);
    }
    candidates.push(
      ...satietySuggestions({
        plate,
        slot,
        goal,
        figures: context.targets !== undefined,
        history: context.history,
        groupsOf: context.groupsOf,
        profile: context.profile,
      }),
    );
  }
  if (context.targets !== undefined) {
    candidates.push(
      ...applicableNutrientSuggestions({
        plate,
        slot,
        earlierPlates: others,
        targets: context.targets,
        groupsOf: context.groupsOf,
      }),
    );
  }
  const picked = candidates.find(
    (s) => s.pattern !== previous && !unusable(s.pattern, context.profile),
  );
  if (picked) return withFoodSlots(picked, context.profile);
  const pattern = applicablePatterns(plate, context).find(
    (p) => p !== previous && !unusable(p, context.profile),
  );
  return pattern === undefined ? null : withFoodSlots({ pattern, params: {} }, context.profile);
}

/**
 * The hint on the next open meal: a "day so far" nutrient rule (protein, then fibre at dinner)
 * when the logged plates have data, else the food-group hint.
 */
export function openPlateSuggestionFor(input: {
  readonly dayPlates: readonly PlateLog[];
  readonly slot: MealSlot;
  readonly groupsOf?: GroupsOf | undefined;
  readonly targets?: Required<Nutrients> | undefined;
  readonly profile?: Profile | undefined;
}): CoachSuggestion | null {
  if (input.slot !== 'lunch' && input.slot !== 'dinner') return null;
  if (input.dayPlates.length === 0) return null;
  const group = openPlatePatternFor(input);
  // A missing food group (veg) is the more basic remark and stays first.
  if (group === 'vegLight') return { pattern: group, params: {} };
  if (input.targets !== undefined) {
    const low = daySoFarSuggestions(input.slot, input.dayPlates, input.targets)[0];
    if (low !== undefined) return withFoodSlots(low, input.profile);
  }
  return group === null || unusable(group, input.profile)
    ? null
    : withFoodSlots({ pattern: group, params: {} }, input.profile);
}
