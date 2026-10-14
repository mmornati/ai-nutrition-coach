import {
  COACH_ANCHORS,
  COMPOSITION_PATTERNS,
  coachQuestionKey,
  type CoachAnchor,
  type CompositionPattern,
} from '../value-types/composition-pattern';

export interface CoachTaxonomyEntry {
  readonly key: string;
  readonly anchor: CoachAnchor;
  readonly pattern: CompositionPattern;
}

/**
 * The bounded, curated v1 taxonomy: 3 anchors x 6 patterns = 18 keys. Copy lives outside the
 * core (l10n); this is only the reviewable set of identities. If a reviewer rejects an entry the
 * task is to remove its copy, not to invent a new key.
 */
export const COACH_TAXONOMY: readonly CoachTaxonomyEntry[] = Object.freeze(
  COACH_ANCHORS.flatMap((anchor) =>
    COMPOSITION_PATTERNS.map((pattern) =>
      Object.freeze({ key: coachQuestionKey(anchor, pattern), anchor, pattern }),
    ),
  ),
);

export const COACH_TAXONOMY_KEYS: readonly string[] = Object.freeze(
  COACH_TAXONOMY.map((e) => e.key),
);
