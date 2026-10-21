/**
 * The optional profile (docs/adr/0006, phase 3a). Every field is optional and nothing identifies
 * anyone: no name, no birth date, no weight, no height. An age BAND, not an age; adults only
 * (docs/adults-only.md). It only tunes the daily guide and, later, the coach.
 */
export const AGE_BANDS = ['18-29', '30-49', '50-64', '65+'] as const;
export const SEXES = ['female', 'male', 'unspecified'] as const;
export const ACTIVITIES = ['low', 'moderate', 'high'] as const;
export const GOALS = ['eatBetter', 'maintain', 'lose', 'gain'] as const;
export const DIETS = ['omnivore', 'vegetarian', 'vegan', 'pescatarian'] as const;

export type AgeBand = (typeof AGE_BANDS)[number];
export type Sex = (typeof SEXES)[number];
export type Activity = (typeof ACTIVITIES)[number];
export type Goal = (typeof GOALS)[number];
export type Diet = (typeof DIETS)[number];

export interface Profile {
  readonly ageBand?: AgeBand;
  readonly sex?: Sex;
  readonly activity?: Activity;
  readonly goal?: Goal;
  readonly diet?: Diet;
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
  if (ageBand) out.ageBand = ageBand;
  if (sex) out.sex = sex;
  if (activity) out.activity = activity;
  if (goal) out.goal = goal;
  if (diet) out.diet = diet;
  if (allergies) out.allergies = allergies;
  return Object.keys(out).length > 0 ? Object.freeze(out) : undefined;
}
