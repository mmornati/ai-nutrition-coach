import type { Coach } from '../ports/coach';
import { coachFound, NO_COACH_QUESTION } from '../results/coach';
import {
  isCoachAnchor,
  isCompositionPattern,
  coachQuestionKey,
  withQuestionParams,
  type CoachParams,
} from '../value-types/composition-pattern';

/** Resolves a taxonomy key to its copy, or `undefined` when no copy ships for it. */
export type CoachStringLookup = (key: string, params: CoachParams) => string | undefined;

/**
 * The v1 `Coach` rung. For every `(anchor, pattern)` in the bounded taxonomy whose key has copy,
 * returns `coachFound`; anything else (unknown pair, missing or empty copy, a throwing lookup)
 * is `noCoachQuestion` so the UI renders nothing. Localised copy is injected, so l10n stays
 * outside the core.
 */
export function createTemplateCoach(lookup: CoachStringLookup): Coach {
  return {
    questionFor({ anchor, pattern, params }) {
      if (!isCoachAnchor(anchor) || !isCompositionPattern(pattern)) return NO_COACH_QUESTION;
      const key = coachQuestionKey(anchor, pattern);
      let text: string | undefined;
      try {
        text = lookup(key, params ?? {});
      } catch {
        return NO_COACH_QUESTION;
      }
      if (text === undefined || text.length === 0) return NO_COACH_QUESTION;
      return coachFound({ key: withQuestionParams(key, params), text, anchor, pattern });
    },
  };
}
