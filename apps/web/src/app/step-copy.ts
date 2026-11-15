import type { CoachStep, StepId } from '@anc/core';
import { fill, type Strings } from '../i18n';
import { lowerFirst } from './coach-copy';

/** The step in words: "a portion of vegetables at lunch", "a smaller portion of Pizza". */
export function stepName(
  all: Strings,
  step: { readonly id: StepId; readonly food?: string },
): string {
  const template = all.coachStep.names[step.id];
  return fill(template, { food: lowerFirst(step.food ?? '') });
}

/** The same, for a stored step. */
export const stepLabel = (all: Strings, step: CoachStep): string => stepName(all, step);
