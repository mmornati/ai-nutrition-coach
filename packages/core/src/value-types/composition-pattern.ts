/**
 * The eight composition patterns of the bounded coach taxonomy. The first six describe a plate;
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

export function parseCompositionPattern(token: string): CompositionPattern | null {
  return COMPOSITION_PATTERNS.find((p) => p === token) ?? null;
}

export function isCoachAnchor(value: unknown): value is CoachAnchor {
  return COACH_ANCHORS.includes(value as CoachAnchor);
}

export function isCompositionPattern(value: unknown): value is CompositionPattern {
  return COMPOSITION_PATTERNS.includes(value as CompositionPattern);
}
