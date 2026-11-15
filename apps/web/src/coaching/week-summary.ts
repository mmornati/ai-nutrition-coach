import {
  buildWeekMessages,
  COACH_LIMITS,
  validateCoachText,
  type CoachLocale,
  type Nutrients,
  type Profile,
  type WeeklyReview,
} from '@anc/core';
import type { CoachingAi } from '../ai';
import { NO_AI_CONTEXT, type AiContextProvider } from './context';

export type WeekSummaryResult =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'busy' }
  | { readonly kind: 'consent' }
  | { readonly kind: 'unavailable' }
  /** The AI answered with something that did not pass the checks; nothing of it is kept. */
  | { readonly kind: 'unsure' }
  | { readonly kind: 'failure'; readonly message: string };

export interface WeekSummaryDeps {
  readonly coaching: Pick<CoachingAi, 'complete'>;
  readonly numbersOn: () => boolean;
  readonly locale: () => CoachLocale;
  readonly targets: () => Required<Nutrients>;
  readonly profile: () => Profile | undefined;
  /** The goal, the step and the switches, read at each request (default: no weight talk). */
  readonly context?: AiContextProvider;
}

/**
 * The optional AI paragraph under the weekly review: the review's counts and averages go to the AI,
 * and a short paragraph (at most 600 characters, validated like a coach note) comes back. It never
 * replaces the rule-based review and is only ever asked for by the person. Never throws.
 */
export async function requestWeekSummary(
  deps: WeekSummaryDeps,
  review: WeeklyReview,
): Promise<WeekSummaryResult> {
  const numbersOn = deps.numbersOn();
  const context = deps.context?.() ?? NO_AI_CONTEXT;
  try {
    const result = await deps.coaching.complete(
      buildWeekMessages({
        locale: deps.locale(),
        numbersOn,
        review,
        targets: deps.targets(),
        profile: deps.profile(),
        weightHelp: context.weightHelp,
        step: context.step,
        weightTrend: context.weightTrend,
      }),
      { maxTokens: 360, temperature: 0.5 },
    );
    switch (result.kind) {
      case 'busy':
        return { kind: 'busy' };
      case 'consentRequired':
        return { kind: 'consent' };
      case 'unavailable':
        return { kind: 'unavailable' };
      case 'failure':
        return { kind: 'failure', message: result.message };
      case 'text': {
        const checked = validateCoachText(result.text, {
          maxChars: COACH_LIMITS.weekChars,
          numbersOn,
          locale: deps.locale(),
          ...context.limits,
        });
        return checked.ok ? { kind: 'text', text: checked.text } : { kind: 'unsure' };
      }
    }
  } catch {
    return { kind: 'failure', message: '' };
  }
}
