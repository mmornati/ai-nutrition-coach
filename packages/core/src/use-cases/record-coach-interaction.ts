import { systemClock, type Clock } from '../common';
import type { CoachNote } from '../entities/coach-note';
import type { Coach } from '../ports/coach';
import type { CoachNoteStore } from '../ports/coach-note-store';
import {
  coachInteractionFailed,
  type CoachInteractionResult,
  type CoachQuestionResult,
} from '../results/coach';
import { storeFailure } from '../results/store';
import { coachNoteDismissalKey } from '../value-types/coach-dismissal-key';
import type { CoachInteraction, CoachInteractionLog } from '../value-types/coach-interaction';
import {
  parseCompositionPattern,
  type CompositionPattern,
} from '../value-types/composition-pattern';

export interface RecordCoachInteractionResult {
  readonly kind: CoachInteraction;
  readonly noteId: number;
  readonly recordInteractionOutcome: CoachInteractionResult;
  /** The bounded depth follow-up a `sure` may append; `null` for everything else. */
  readonly followedUpNote: CoachNote | null;
}

export interface RecordCoachInteraction {
  /**
   * `sure` appends at most ONE bounded depth follow-up and records the interaction; `askLater`
   * and `dismiss` also write the durable dismissal marker; `depthAnswer` only logs.
   */
  record(input: {
    readonly note: CoachNote;
    readonly kind: CoachInteraction;
  }): Promise<RecordCoachInteractionResult>;
  /** The open-plate hint is dismissed by key (day, slot): only a marker, no synthetic note. */
  dismissOpenPlateHint(dismissalKey: string): Promise<CoachInteractionResult>;
}

const POST_RESOLVE_PREFIX = 'post.resolve.';

function patternFromKey(questionKey: string): CompositionPattern | null {
  if (!questionKey.startsWith(POST_RESOLVE_PREFIX)) return null;
  return parseCompositionPattern(questionKey.slice(POST_RESOLVE_PREFIX.length));
}

export function createRecordCoachInteraction(deps: {
  readonly coach: Coach;
  readonly store: CoachNoteStore;
  readonly clock?: Clock;
}): RecordCoachInteraction {
  const { coach, store } = deps;
  const clock = deps.clock ?? systemClock;
  const adapterFailed = () => coachInteractionFailed(storeFailure('storeOperation'));

  async function recordInteraction(log: CoachInteractionLog): Promise<CoachInteractionResult> {
    try {
      return await store.recordInteraction(log);
    } catch {
      return adapterFailed();
    }
  }

  async function recordDismissal(key: string): Promise<CoachInteractionResult> {
    try {
      return await store.recordDismissal(key);
    } catch {
      return adapterFailed();
    }
  }

  async function maybeAppendDepthFollowUp(note: CoachNote): Promise<CoachNote | null> {
    if (note.anchor !== 'postResolve') return null;
    const pattern = patternFromKey(note.questionKey);
    if (pattern === null) return null;

    // At most one follow-up per plate.
    let existing: readonly CoachNote[];
    try {
      existing = await store.forPlate(note.plateLogId);
    } catch {
      return null;
    }
    if (existing.some((candidate) => candidate.anchor === 'depthFollowUp')) return null;

    let result: CoachQuestionResult;
    try {
      result = coach.questionFor({ anchor: 'depthFollowUp', pattern });
    } catch {
      return null;
    }
    if (result.kind === 'noCoachQuestion') return null;

    try {
      const appended = await store.append({
        id: 0,
        plateLogId: note.plateLogId,
        anchor: 'depthFollowUp',
        questionKey: result.question.key,
        text: result.question.text,
        generatedAt: clock(),
      });
      return appended.kind === 'coachNoteAppended' ? appended.note : null;
    } catch {
      return null;
    }
  }

  return {
    dismissOpenPlateHint: (dismissalKey) => recordDismissal(dismissalKey),

    async record({ note, kind }) {
      const outcome = await recordInteraction({ noteId: note.id, kind, at: clock() });
      let followedUpNote: CoachNote | null = null;
      switch (kind) {
        case 'sure':
          followedUpNote = await maybeAppendDepthFollowUp(note);
          break;
        case 'askLater':
        case 'dismiss':
          await recordDismissal(coachNoteDismissalKey(note.id));
          break;
        case 'depthAnswer':
          break;
        default: {
          const _exhaustive: never = kind;
          return _exhaustive;
        }
      }
      return { kind, noteId: note.id, recordInteractionOutcome: outcome, followedUpNote };
    },
  };
}
