/**
 * "One next step": the single small action a person may accept from the coach ("Try it this
 * week"). At most ONE is active. It is kept in the synced key/value store under `coach.step` as a
 * small JSON object (validated here and in the vault allow-list), so it syncs, exports and is
 * erased like the other preferences; there is no table.
 *
 * It is never a score: no count of days done, no run, no ticking. The week review looks at the
 * logged meals and says, descriptively, what it can check ("They were on four of the six lunches
 * logged"); a step the data cannot show (a smaller portion) is not checked at all.
 */
import type { PlateLog } from '../entities/plate-log';
import { isSameLocalDay, startOfLocalDay } from '../value-types/calendar-day';
import type { CompositionPattern } from '../value-types/composition-pattern';
import type { MealSlot } from '../day/meal-slot';
import {
  isFish,
  isPulse,
  isSugaryDrink,
  isUnsaltedNut,
  isWholegrain,
  isCerealStarch,
} from './food-detect';
import { slotOfPlate, storedGroupOnly, tallyPlate, type GroupsOf } from './day-coaching';

export const STEP_KV_KEY = 'coach.step';

export const STEP_IDS = [
  'vegAtLunch',
  'vegAtDinner',
  'proteinAtBreakfast',
  'proteinAtLunch',
  'proteinAtDinner',
  'waterForDrinks',
  'fruitSnack',
  'smallerPortion',
  'pulsesWeek',
  'fishWeek',
  'wholegrainWeek',
  'nutsWeek',
] as const;
export type StepId = (typeof STEP_IDS)[number];

export interface CoachStep {
  readonly id: StepId;
  /** When it was accepted (epoch ms). The review looks at the days from this day on. */
  readonly at: number;
  /** The food a step is about (`smallerPortion`); a name as logged, at most 40 characters. */
  readonly food?: string;
}

const MAX_FOOD = 40;
const ISO_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const isStepId = (value: unknown): value is StepId =>
  typeof value === 'string' && (STEP_IDS as readonly string[]).includes(value);

/** The stored text of a step: `{"id":"vegAtLunch","at":"2026-11-15T10:00:00.000Z"}`. */
export function serializeStep(step: CoachStep): string {
  return JSON.stringify({
    id: step.id,
    at: new Date(step.at).toISOString(),
    ...(step.food !== undefined ? { food: step.food } : {}),
  });
}

/** A stored step, or `null` when the text is not exactly what `serializeStep` writes. */
export function parseStep(text: string | null | undefined): CoachStep | null {
  if (typeof text !== 'string') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.some((k) => k !== 'id' && k !== 'at' && k !== 'food')) return null;
  if (!isStepId(o['id']) || typeof o['at'] !== 'string' || !ISO_MILLIS.test(o['at'])) return null;
  const at = Date.parse(o['at']);
  if (!Number.isFinite(at)) return null;
  const food = o['food'];
  if (food !== undefined && (typeof food !== 'string' || food === '' || food.length > MAX_FOOD)) {
    return null;
  }
  return { id: o['id'], at, ...(typeof food === 'string' ? { food } : {}) };
}

/** Whether a stored value is a valid step (the vault allow-list uses this). */
export const isValidStepText = (text: string): boolean => parseStep(text) !== null;

export interface StepOffer {
  readonly id: StepId;
  readonly food?: string;
}

/**
 * The step a shown suggestion can offer, or `null` (some suggestions carry none: a gentle "eat
 * enough" line is never turned into a task). `slot` is the meal of the plate the note sits under.
 */
export function stepOfferFor(
  pattern: CompositionPattern,
  slot: MealSlot,
  params: { readonly food?: string | number | undefined } = {},
): StepOffer | null {
  const vegHere = (): StepOffer | null =>
    slot === 'lunch' ? { id: 'vegAtLunch' } : slot === 'dinner' ? { id: 'vegAtDinner' } : null;
  const proteinHere = (): StepOffer | null =>
    slot === 'breakfast'
      ? { id: 'proteinAtBreakfast' }
      : slot === 'lunch'
        ? { id: 'proteinAtLunch' }
        : slot === 'dinner'
          ? { id: 'proteinAtDinner' }
          : null;
  switch (pattern) {
    case 'vegLight':
    case 'proteinHeavy':
    case 'starchHeavy':
    case 'vegVolumeLose':
      return vegHere();
    case 'vegRich':
    case 'proteinMissingDay':
    case 'proteinLowDay':
    case 'proteinPlateLose':
    case 'breakfastSimple':
      return proteinHere();
    case 'sugarsHighItem':
    case 'sugaryDrink':
      return { id: 'waterForDrinks' };
    case 'energyDenseSnack':
      return { id: 'fruitSnack' };
    case 'energyHighDay': {
      const food = typeof params.food === 'string' ? params.food.slice(0, MAX_FOOD) : '';
      return food === '' ? null : { id: 'smallerPortion', food };
    }
    default:
      return null;
  }
}

/** What the week review can say about a step from the logged meals, as counts of the data. */
export interface StepReview {
  readonly id: StepId;
  /** `meals`: of the meals of that kind; `days`: of the days logged; `count`: days with the food. */
  readonly kind: 'meals' | 'days' | 'count';
  readonly matched: number;
  readonly of: number;
}

/** Fewer than this many meals or days and the review does not quote a ratio. */
export const MIN_STEP_SAMPLE = 2;

/**
 * Looks at the plates logged from the step's day on (at most 14 days of them, today included) and
 * counts the meals or days the step speaks about. `null` for a step the data cannot show, or when
 * too little was logged yet to say anything.
 */
export function reviewStep(input: {
  readonly step: CoachStep;
  readonly plates: readonly PlateLog[];
  readonly today: number;
  readonly groupsOf?: GroupsOf | undefined;
}): StepReview | null {
  const { step } = input;
  const groupsOf = input.groupsOf ?? storedGroupOnly;
  const from = startOfLocalDay(step.at);
  const plates = input.plates.filter(
    (p) =>
      p.entries.length > 0 && p.loggedAtUtc >= from && p.loggedAtUtc <= input.today + 86_400_000,
  );
  const mealsOf = (slot: MealSlot, has: (p: PlateLog) => boolean): StepReview | null => {
    const meals = plates.filter((p) => slotOfPlate(p) === slot);
    if (meals.length < MIN_STEP_SAMPLE) return null;
    return { id: step.id, kind: 'meals', matched: meals.filter(has).length, of: meals.length };
  };
  const hasGroup = (g: 'vegFruit' | 'protein') => (p: PlateLog) => {
    const t = tallyPlate(p, groupsOf);
    return (g === 'vegFruit' ? t.veg : t.protein) > 0;
  };
  const dayKeys = new Set(plates.map((p) => startOfLocalDay(p.loggedAtUtc)));
  const daysWith = (pred: (p: PlateLog) => boolean): number => {
    const days = new Set<number>();
    for (const p of plates) if (pred(p)) days.add(startOfLocalDay(p.loggedAtUtc));
    return days.size;
  };
  const anyEntry =
    (test: (f: PlateLog['entries'][number]['databaseFood']) => boolean) => (p: PlateLog) =>
      p.entries.some((e) => test(e.databaseFood));
  switch (step.id) {
    case 'vegAtLunch':
      return mealsOf('lunch', hasGroup('vegFruit'));
    case 'vegAtDinner':
      return mealsOf('dinner', hasGroup('vegFruit'));
    case 'proteinAtBreakfast':
      return mealsOf('breakfast', hasGroup('protein'));
    case 'proteinAtLunch':
      return mealsOf('lunch', hasGroup('protein'));
    case 'proteinAtDinner':
      return mealsOf('dinner', hasGroup('protein'));
    case 'waterForDrinks':
      return dayKeys.size < MIN_STEP_SAMPLE
        ? null
        : {
            id: step.id,
            kind: 'days',
            matched: daysWith(anyEntry(isSugaryDrink)),
            of: dayKeys.size,
          };
    case 'pulsesWeek':
      return dayKeys.size < MIN_STEP_SAMPLE
        ? null
        : { id: step.id, kind: 'count', matched: daysWith(anyEntry(isPulse)), of: dayKeys.size };
    case 'fishWeek':
      return dayKeys.size < MIN_STEP_SAMPLE
        ? null
        : { id: step.id, kind: 'count', matched: daysWith(anyEntry(isFish)), of: dayKeys.size };
    case 'nutsWeek':
      return dayKeys.size < MIN_STEP_SAMPLE
        ? null
        : {
            id: step.id,
            kind: 'count',
            matched: daysWith(anyEntry(isUnsaltedNut)),
            of: dayKeys.size,
          };
    case 'wholegrainWeek': {
      const cereals = plates
        .flatMap((p) => p.entries.map((e) => e.databaseFood))
        .filter(isCerealStarch);
      return cereals.length < MIN_STEP_SAMPLE
        ? null
        : {
            id: step.id,
            kind: 'meals',
            matched: cereals.filter(isWholegrain).length,
            of: cereals.length,
          };
    }
    case 'fruitSnack':
    case 'smallerPortion':
      return null;
    default: {
      const _exhaustive: never = step.id;
      return _exhaustive;
    }
  }
}

/** Whether `plate` was logged on the same local day as `ms`. */
export const loggedOn = (plate: PlateLog, ms: number): boolean =>
  isSameLocalDay(plate.loggedAtUtc, ms);
