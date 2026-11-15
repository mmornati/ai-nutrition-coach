import { HEIGHT_RANGE_CM, roundMeasurement } from './body-measurement';

/**
 * The optional profile (docs/adr/0006, phase 3a; docs/adr/0008). Every field is optional and
 * nothing identifies anyone: no name, no birth date. An age BAND, not an age; adults only
 * (docs/adults-only.md). A height is allowed (docs/adr/0008); weights and waists are dated
 * measurements of their own (`BodyMeasurement`), not profile fields. It tunes the daily guide
 * and, later, the coach.
 */
export const AGE_BANDS = ['18-29', '30-49', '50-64', '65+'] as const;
export const SEXES = ['female', 'male', 'unspecified'] as const;
export const ACTIVITIES = ['low', 'moderate', 'high', 'veryHigh'] as const;
export const GOALS = ['eatBetter', 'maintain', 'lose', 'gain'] as const;
export const DIETS = ['omnivore', 'vegetarian', 'vegan', 'pescatarian'] as const;
/** How fast a weight goal moves (docs/adr/0008): the size of the daily energy adjustment. */
export const PACES = ['gentle', 'standard', 'faster'] as const;
/** Display and input units only: everything is stored in kg, cm and kcal. */
export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
/** Accepted range of a person-set daily energy figure, in kcal (the form adds the floor). */
export const CUSTOM_ENERGY_RANGE_KCAL = Object.freeze({ min: 800, max: 6000 });

export type AgeBand = (typeof AGE_BANDS)[number];
export type Sex = (typeof SEXES)[number];
export type Activity = (typeof ACTIVITIES)[number];
export type Goal = (typeof GOALS)[number];
export type Diet = (typeof DIETS)[number];
export type Pace = (typeof PACES)[number];
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export interface Profile {
  readonly ageBand?: AgeBand;
  readonly sex?: Sex;
  readonly activity?: Activity;
  readonly goal?: Goal;
  readonly diet?: Diet;
  /** Height in centimetres, 100-250 (docs/adr/0008). */
  readonly heightCm?: number;
  /** How the person reads and types lengths and weights; storage is always SI. */
  readonly units?: UnitSystem;
  /** How fast a lose / gain goal moves; absent reads as the gentle pace. */
  readonly pace?: Pace;
  /** A daily energy figure the person set themselves; replaces the computed one. */
  readonly customEnergyKcal?: number;
  /** Set when pregnant or breastfeeding: a weight-loss guide is then never computed. */
  readonly pregnantOrBreastfeeding?: boolean;
  /** Free tags the person typed, trimmed, de-duplicated (case-insensitive), capped. */
  readonly allergies?: readonly string[];
}

export const MAX_ALLERGY_TAGS = 12;
export const MAX_ALLERGY_TAG_LENGTH = 40;

const pick = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
  typeof value === 'string' && (list as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

/** Clean free tags: trimmed, non-empty, no control characters, de-duplicated, capped. */
export function sanitizeAllergyTags(input: unknown): readonly string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input as unknown[]) {
    if (typeof item !== 'string') continue;
    const tag = [...item]
      .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (tag === '' || tag.length > MAX_ALLERGY_TAG_LENGTH) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === MAX_ALLERGY_TAGS) break;
  }
  return out.length > 0 ? Object.freeze(out) : undefined;
}

/** Keep only the known fields with known values; `undefined` when nothing survives. */
export function sanitizeProfile(input: unknown): Profile | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const source = input as Record<string, unknown>;
  const out: { -readonly [K in keyof Profile]: Profile[K] } = {};
  const ageBand = pick(AGE_BANDS, source['ageBand']);
  const sex = pick(SEXES, source['sex']);
  const activity = pick(ACTIVITIES, source['activity']);
  const goal = pick(GOALS, source['goal']);
  const diet = pick(DIETS, source['diet']);
  const allergies = sanitizeAllergyTags(source['allergies']);
  const units = pick(UNIT_SYSTEMS, source['units']);
  const pace = pick(PACES, source['pace']);
  const height = source['heightCm'];
  const custom = source['customEnergyKcal'];
  if (ageBand) out.ageBand = ageBand;
  if (sex) out.sex = sex;
  if (activity) out.activity = activity;
  if (goal) out.goal = goal;
  if (diet) out.diet = diet;
  if (allergies) out.allergies = allergies;
  if (units) out.units = units;
  if (pace) out.pace = pace;
  if (
    typeof height === 'number' &&
    Number.isFinite(height) &&
    height >= HEIGHT_RANGE_CM.min &&
    height <= HEIGHT_RANGE_CM.max
  ) {
    out.heightCm = roundMeasurement(height);
  }
  if (
    typeof custom === 'number' &&
    Number.isInteger(custom) &&
    custom >= CUSTOM_ENERGY_RANGE_KCAL.min &&
    custom <= CUSTOM_ENERGY_RANGE_KCAL.max
  ) {
    out.customEnergyKcal = custom;
  }
  // Not kept for sex "male": the flag is cleared when the person switches to it.
  if (source['pregnantOrBreastfeeding'] === true && sex !== 'male') {
    out.pregnantOrBreastfeeding = true;
  }
  return Object.keys(out).length > 0 ? Object.freeze(out) : undefined;
}
