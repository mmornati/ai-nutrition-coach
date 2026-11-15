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
import { completeBounded, reviewContext, reviewOutputText, ReviewGate } from './review';

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
  /** The session's second-pass state (abort on lock, temperature, unreadable count). */
  readonly reviews?: ReviewGate;
  /** Test seam. Default `COACH_LIMITS.reviewTimeoutMs`: the review call. */
  readonly reviewTimeoutMs?: number;
  /** Test seam. Default `COACH_LIMITS.weekTimeoutMs`: the coach call. */
  readonly timeoutMs?: number;
}

/**
 * The optional AI paragraph under the weekly review: the review's counts and averages go to the AI,
 * and a short paragraph (at most 600 characters, validated like a coach note and then checked a
 * second time by the same AI) comes back. It never
 * replaces the rule-based review and is only ever asked for by the person. Never throws.
 */
export async function requestWeekSummary(
  deps: WeekSummaryDeps,
  review: WeeklyReview,
): Promise<WeekSummaryResult> {
  const numbersOn = deps.numbersOn();
  const context = deps.context?.() ?? NO_AI_CONTEXT;
  const gate = deps.reviews ?? new ReviewGate();
  try {
    const result = await completeBounded(
      deps.coaching,
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
      { timeoutMs: deps.timeoutMs ?? COACH_LIMITS.weekTimeoutMs, signal: gate.signal },
    );
    if (gate.ended()) return { kind: 'failure', message: '' };
    switch (result.kind) {
      case 'timeout':
      case 'ended':
        return { kind: 'failure', message: '' };
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
        if (!checked.ok) return { kind: 'unsure' };
        // The second pass: shown only if the same AI also finds the paragraph safe. An error, a
        // timeout, a rate limit or an unsafe verdict is the "not sure" line, nothing of it is kept.
        const reviewed = await reviewOutputText(
          deps.coaching,
          checked.text,
          reviewContext(deps.locale(), context.limits),
          { timeoutMs: deps.reviewTimeoutMs ?? COACH_LIMITS.reviewTimeoutMs, gate },
        );
        if (gate.ended()) return { kind: 'failure', message: '' };
        return reviewed.kind === 'ok' ? { kind: 'text', text: checked.text } : { kind: 'unsure' };
      }
    }
  } catch {
    return { kind: 'failure', message: '' };
  }
}
