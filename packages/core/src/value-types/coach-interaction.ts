import type { EpochMs } from '../common';

export const COACH_INTERACTIONS = ['sure', 'askLater', 'dismiss', 'depthAnswer'] as const;
export type CoachInteraction = (typeof COACH_INTERACTIONS)[number];

/** Persisted name of an interaction: the literal itself. */
export function persistedInteractionName(kind: CoachInteraction): string {
  return kind;
}

/** One row of the append-only interaction log. */
export interface CoachInteractionLog {
  readonly noteId: number;
  readonly kind: CoachInteraction;
  readonly at: EpochMs;
}
