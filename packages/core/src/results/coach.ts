import type { CoachNote } from '../entities/coach-note';
import type { CoachQuestion } from '../entities/coach-question';
import type { StoreFailure } from './store';

export type CoachQuestionResult =
  | { readonly kind: 'coachFound'; readonly question: CoachQuestion }
  | { readonly kind: 'noCoachQuestion' };

export const coachFound = (question: CoachQuestion): CoachQuestionResult => ({
  kind: 'coachFound',
  question,
});
/** The UI renders nothing for this: no fallback copy, no error UI. */
export const NO_COACH_QUESTION: CoachQuestionResult = Object.freeze({ kind: 'noCoachQuestion' });

export type CoachNoteAppendResult =
  | { readonly kind: 'coachNoteAppended'; readonly note: CoachNote }
  | { readonly kind: 'coachNoteAppendFailure'; readonly cause: StoreFailure };

export type NoCoachNoteReason = 'emptyPlate' | 'unknownPattern' | 'coachEmpty' | 'appendFailed';

export type CoachNoteGenerationResult =
  | { readonly kind: 'coachNoteGenerated'; readonly note: CoachNote; readonly reason: 'matched' }
  | { readonly kind: 'noCoachNoteGenerated'; readonly reason: NoCoachNoteReason };

export type CoachInteractionResult =
  | { readonly kind: 'coachInteractionRecorded'; readonly interactionId: number }
  | { readonly kind: 'coachInteractionFailed'; readonly cause: StoreFailure };

export const coachInteractionRecorded = (interactionId: number): CoachInteractionResult => ({
  kind: 'coachInteractionRecorded',
  interactionId,
});
export const coachInteractionFailed = (cause: StoreFailure): CoachInteractionResult => ({
  kind: 'coachInteractionFailed',
  cause,
});
