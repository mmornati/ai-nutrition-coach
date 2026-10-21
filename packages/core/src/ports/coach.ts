import type { CoachQuestionResult } from '../results/coach';
import type {
  CoachAnchor,
  CoachParams,
  CompositionPattern,
} from '../value-types/composition-pattern';

/** Resolves a question for an `(anchor, pattern)` pair; unknown pairs yield `noCoachQuestion`. */
export interface Coach {
  questionFor(request: {
    readonly anchor: CoachAnchor;
    readonly pattern: CompositionPattern;
    /** Raw values for the pattern's copy (nutrient notes). */
    readonly params?: CoachParams | undefined;
  }): CoachQuestionResult;
}
