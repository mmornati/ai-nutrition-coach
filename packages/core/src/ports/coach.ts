import type { CoachQuestionResult } from '../results/coach';
import type { CoachAnchor, CompositionPattern } from '../value-types/composition-pattern';

/** Resolves a question for an `(anchor, pattern)` pair; unknown pairs yield `noCoachQuestion`. */
export interface Coach {
  questionFor(request: {
    readonly anchor: CoachAnchor;
    readonly pattern: CompositionPattern;
  }): CoachQuestionResult;
}
