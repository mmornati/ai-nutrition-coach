import type { DatabaseFood, FoodGroup } from '../entities/database-food';
import type { PlateLog } from '../entities/plate-log';
import { mealSlotForHour, type MealSlot } from '../day/meal-slot';
import { isSameLocalDay } from '../value-types/calendar-day';
import type { CompositionPattern } from '../value-types/composition-pattern';

/**
 * The food groups one logged food counts in. A mixed dish ("chicken salad", "tomato pasta") counts
 * in several groups; the stored `foodGroup` stays the single primary group, so nothing in storage
 * changes. The web app injects a resolver that adds the groups its name classifier finds; the
 * default is the stored group alone.
 */
export type GroupsOf = (food: DatabaseFood) => readonly FoodGroup[];

export const storedGroupOnly: GroupsOf = (food) => [food.foodGroup];

export interface GroupTally {
  readonly veg: number;
  readonly protein: number;
  readonly starch: number;
  readonly dairy: number;
}

/** Entries per major group. An entry in several groups counts once in each. */
export function tallyPlate(plate: PlateLog, groupsOf: GroupsOf = storedGroupOnly): GroupTally {
  let veg = 0;
  let protein = 0;
  let starch = 0;
  let dairy = 0;
  for (const entry of plate.entries) {
    for (const group of new Set(groupsOf(entry.databaseFood))) {
      if (group === 'vegFruit') veg++;
      else if (group === 'protein') protein++;
      else if (group === 'starch') starch++;
      else if (group === 'dairy') dairy++;
    }
  }
  return { veg, protein, starch, dairy };
}

/** Which major groups appear anywhere in the given plates. */
export function groupsPresent(
  plates: readonly PlateLog[],
  groupsOf: GroupsOf = storedGroupOnly,
): { readonly veg: boolean; readonly protein: boolean; readonly dairy: boolean } {
  let veg = false;
  let protein = false;
  let dairy = false;
  for (const plate of plates) {
    const t = tallyPlate(plate, groupsOf);
    veg ||= t.veg > 0;
    protein ||= t.protein > 0;
    dairy ||= t.dairy > 0;
  }
  return { veg, protein, dairy };
}

/** The local meal slot a plate was logged in. */
export function slotOfPlate(plate: PlateLog): MealSlot {
  return mealSlotForHour(new Date(plate.loggedAtUtc).getHours());
}

/** The other plates of the plate's own local day (the plate itself is excluded). */
export function otherPlatesOfSameDay(
  plate: PlateLog,
  dayPlates: readonly PlateLog[],
): readonly PlateLog[] {
  return dayPlates.filter(
    (p) => p.id !== plate.id && isSameLocalDay(p.loggedAtUtc, plate.loggedAtUtc),
  );
}

export interface CoachPatternContext {
  /** The day's plates (the plate itself may be included). Absent: the plate stands alone. */
  readonly dayPlates?: readonly PlateLog[] | undefined;
  /** The pattern of the most recent coach note already written today, to avoid repeating it. */
  readonly previousPattern?: CompositionPattern | null | undefined;
  readonly groupsOf?: GroupsOf | undefined;
}

/**
 * The patterns that apply to a plate, best first. The caller takes the first one that is not the
 * day's previous pattern; an empty list means silence.
 *
 * Decision table (slot, then what the day holds):
 *
 *   late (23-04)                       -> nothing
 *   breakfast (05-10)                  -> balanced if veg/fruit sits with another group,
 *                                         else breakfastSimple. Never a veg or protein nudge.
 *   lunch / dinner (11-22), in order:
 *     no veg or fruit on the plate or earlier today          -> vegLight
 *     plate has no protein, none earlier today, veg >= 2     -> vegRich
 *     plate has no protein, none earlier today (otherwise)   -> proteinMissingDay
 *     2+ protein entries, outnumbering a non-zero veg        -> proteinHeavy
 *     2+ starch entries, outnumbering a non-zero veg         -> starchHeavy
 *     a single group, no dairy today                         -> dairyLight
 *     two or more groups                                     -> balanced (last, so it is also the
 *                                                               fallback when the others repeat)
 *   A plate with only `other` foods has nothing to say.
 *   Veg already covered earlier today and none on this plate: no veg note (silence is fine).
 */
export function applicablePatterns(
  plate: PlateLog,
  context: CoachPatternContext = {},
): readonly CompositionPattern[] {
  const groupsOf = context.groupsOf ?? storedGroupOnly;
  const t = tallyPlate(plate, groupsOf);
  if (t.veg + t.protein + t.starch + t.dairy === 0) return [];

  const slot = slotOfPlate(plate);
  const groupCount =
    (t.veg > 0 ? 1 : 0) + (t.protein > 0 ? 1 : 0) + (t.starch > 0 ? 1 : 0) + (t.dairy > 0 ? 1 : 0);

  if (slot === 'late') return [];
  if (slot === 'breakfast') {
    return t.veg > 0 && groupCount >= 2 ? ['balanced'] : ['breakfastSimple'];
  }

  const earlier = groupsPresent(otherPlatesOfSameDay(plate, context.dayPlates ?? []), groupsOf);
  const out: CompositionPattern[] = [];
  const dayHasVeg = earlier.veg || t.veg > 0;
  if (!dayHasVeg) out.push('vegLight');
  if (t.protein === 0 && !earlier.protein) {
    out.push(t.veg >= 2 ? 'vegRich' : 'proteinMissingDay');
  }
  if (t.protein >= 2 && t.veg > 0 && t.protein > t.veg) out.push('proteinHeavy');
  if (t.starch >= 2 && t.veg > 0 && t.starch > t.veg) out.push('starchHeavy');
  if (groupCount <= 1 && t.dairy === 0 && !earlier.dairy) out.push('dairyLight');
  if (groupCount >= 2) out.push('balanced');
  return out;
}

/**
 * The one pattern for a freshly logged plate in the context of its day, or `null` when there is
 * nothing worth saying (silence is a valid outcome). Skips the day's previous pattern so the same
 * note never appears twice in a row.
 */
export function compositionPatternFor(
  plate: PlateLog,
  context: CoachPatternContext = {},
): CompositionPattern | null {
  const previous = context.previousPattern ?? null;
  return applicablePatterns(plate, context).find((p) => p !== previous) ?? null;
}

/**
 * The hint on the next open meal, from what the day holds so far. Only lunch and dinner hint, and
 * only once something was logged today (an empty day says nothing about the person's eating).
 * Veg missing so far wins, then protein; otherwise the hint stays hidden.
 */
export function openPlatePatternFor(input: {
  readonly dayPlates: readonly PlateLog[];
  readonly slot: MealSlot;
  readonly groupsOf?: GroupsOf | undefined;
}): CompositionPattern | null {
  if (input.slot !== 'lunch' && input.slot !== 'dinner') return null;
  if (input.dayPlates.length === 0) return null;
  const present = groupsPresent(input.dayPlates, input.groupsOf ?? storedGroupOnly);
  if (!present.veg) return 'vegLight';
  if (!present.protein) return 'proteinMissingDay';
  return null;
}
