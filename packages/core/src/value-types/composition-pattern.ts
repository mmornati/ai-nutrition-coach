/**
 * The composition patterns of the bounded coach taxonomy. The first six describe a plate;
 * `breakfastSimple` is the calm remark for a morning plate (never a nudge) and
 * `proteinMissingDay` fires when nothing with protein has been logged all day.
 */
export const COMPOSITION_PATTERNS = [
  'vegLight',
  'proteinHeavy',
  'starchHeavy',
  'dairyLight',
  'vegRich',
  'balanced',
  'breakfastSimple',
  'proteinMissingDay',
  // The nutrient layer (phase 3b): these need nutrient data and carry numeric params.
  'sugarsHighItem',
  'saltHighPlate',
  'satFatHighPlate',
  'energyDenseSnack',
  'proteinLowDay',
  'fibreLowDay',
  // The goal- and energy-aware layer (lot 6): the day's energy against the personal guide, and the
  // satiety helpers of a lose goal. They need a personal guide (energy) or the person's own foods.
  'energyHighDay',
  'energyLowDay',
  'sugaryDrink',
  'alcoholDrink',
  'proteinPlateLose',
  'vegVolumeLose',
] as const;
export type CompositionPattern = (typeof COMPOSITION_PATTERNS)[number];

/** The three surfaces a coach question can fire against. */
export const COACH_ANCHORS = ['postResolve', 'openPlate', 'depthFollowUp'] as const;
export type CoachAnchor = (typeof COACH_ANCHORS)[number];

const ANCHOR_KEY_TOKENS: Readonly<Record<CoachAnchor, string>> = {
  postResolve: 'post.resolve',
  openPlate: 'openPlate',
  depthFollowUp: 'depth.followUp',
};

export function compositionPatternKeyToken(pattern: CompositionPattern): string {
  return pattern;
}

export function coachAnchorKeyToken(anchor: CoachAnchor): string {
  return ANCHOR_KEY_TOKENS[anchor];
}

/** The reviewable key of a question: `{anchor.keyToken}.{pattern.keyToken}`. */
export function coachQuestionKey(anchor: CoachAnchor, pattern: CompositionPattern): string {
  return `${coachAnchorKeyToken(anchor)}.${compositionPatternKeyToken(pattern)}`;
}

/**
 * Raw values a nutrient note interpolates ({food}, {g}, {pct}, {est}). Stored inside the note's
 * existing `questionKey` column as a query string (`post.resolve.sugarsHighItem?g=18&pct=20`), so
 * no schema change is needed; copy is worded (and the numbers formatted) at display time.
 */
export type CoachParams = Readonly<Record<string, string | number>>;

/** `base?a=1&b=x` (no `?` when there are no params). Key order is the insertion order. */
export function withQuestionParams(base: string, params?: CoachParams): string {
  const entries = params === undefined ? [] : Object.entries(params);
  if (entries.length === 0) return base;
  const search = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${base}?${search}`;
}

/** The note params that are words, not numbers (`food`, the second food, and the food slots). */
const TEXT_PARAMS: ReadonlySet<string> = new Set([
  'food',
  'food2',
  'lang',
  'protein',
  'dairy',
  'fibre',
  'snack',
  'breakfast',
  'sweet',
  'pulses',
  'wholegrain',
]);

/** True for a param that is a word (a food, a food slot, a language), false for a figure. */
export const isTextParam = (key: string): boolean => TEXT_PARAMS.has(key);

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** The taxonomy key and the params a stored `questionKey` carries. Numeric values come back as numbers. */
export function splitQuestionKey(key: string): {
  readonly base: string;
  readonly params: CoachParams;
} {
  const at = key.indexOf('?');
  if (at < 0) return { base: key, params: {} };
  const params: Record<string, string | number> = {};
  for (const pair of key.slice(at + 1).split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const k = safeDecode(pair.slice(0, eq));
    const v = safeDecode(pair.slice(eq + 1));
    const n = Number(v);
    // `food`, `food2` and the food-slot ids (`protein=eggs.beans`) are text; the rest are numbers.
    params[k] = !TEXT_PARAMS.has(k) && v.trim() !== '' && Number.isFinite(n) ? n : v;
  }
  return { base: key.slice(0, at), params };
}

export function parseCompositionPattern(token: string): CompositionPattern | null {
  return COMPOSITION_PATTERNS.find((p) => p === splitQuestionKey(token).base) ?? null;
}

export function isCoachAnchor(value: unknown): value is CoachAnchor {
  return COACH_ANCHORS.includes(value as CoachAnchor);
}

export function isCompositionPattern(value: unknown): value is CompositionPattern {
  return COMPOSITION_PATTERNS.includes(value as CompositionPattern);
}
