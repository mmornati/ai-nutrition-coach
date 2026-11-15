import type { CoachStep, CoachTextRules, WeightHelp, WeightTrendShare } from '@anc/core';

/**
 * What the goal, the guide, the accepted step and the person's switches add to every AI coaching
 * call, read at call time (a change is picked up by the next call):
 *  - `weightHelp`: whether the coach may help with weight (`lose` or `gain`, only when the guide is
 *    not held by a safeguard); `null` keeps today's restraint;
 *  - `personalGuide`: the guide is the person's own, so the week's energy is compared with it;
 *  - `step`: the one step the person accepted;
 *  - `weightTrend`: the coarse weight trend, present ONLY while the separate switch is on;
 *  - `limits`: what the output validator needs (see `coachTextLimits`).
 */
export interface AiCoachContext {
  readonly weightHelp: WeightHelp;
  readonly personalGuide: boolean;
  readonly step: CoachStep | null;
  readonly weightTrend: WeightTrendShare | null;
  readonly limits: Pick<CoachTextRules, 'weightTalk' | 'floorKcal' | 'guideKcal'>;
}

export type AiContextProvider = () => AiCoachContext;

/** No goal, no step, no trend: today's restraint. The default of every consumer. */
export const NO_AI_CONTEXT: AiCoachContext = Object.freeze({
  weightHelp: null,
  personalGuide: false,
  step: null,
  weightTrend: null,
  limits: Object.freeze({ weightTalk: 'restrained' as const }),
});
