import type { CoachAnchor, CompositionPattern } from '../value-types/composition-pattern';

/**
 * A single question from the bounded taxonomy. `key` is the reviewable identity, `text` is plain
 * copy with no typography, `anchor`/`pattern` say where it fires.
 */
export interface CoachQuestion {
  readonly key: string;
  readonly text: string;
  readonly anchor: CoachAnchor;
  readonly pattern: CompositionPattern;
}

/** The UI dedupes on `key` alone. */
export function coachQuestionEquals(a: CoachQuestion, b: CoachQuestion): boolean {
  return a.key === b.key;
}
