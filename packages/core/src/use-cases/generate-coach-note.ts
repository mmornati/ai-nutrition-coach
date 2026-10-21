import { systemClock, type Clock } from '../common';
import type { PlateLog } from '../entities/plate-log';
import type { Coach } from '../ports/coach';
import type { CoachNoteStore } from '../ports/coach-note-store';
import type {
  CoachNoteAppendResult,
  CoachNoteGenerationResult,
  CoachQuestionResult,
} from '../results/coach';
import { compositionPatternFor, otherPlatesOfSameDay, type GroupsOf } from '../coach/day-coaching';
import type { CoachNote } from '../entities/coach-note';
import {
  parseCompositionPattern,
  type CompositionPattern,
} from '../value-types/composition-pattern';

export interface CoachNoteGenerator {
  /**
   * Never throws: every failure is a `noCoachNoteGenerated` with a reason. `dayPlates` are the
   * plates of the same local day (the plate itself may be included); without them the plate is
   * judged alone.
   */
  generateFor(
    plate: PlateLog,
    context?: { readonly dayPlates?: readonly PlateLog[] },
  ): Promise<CoachNoteGenerationResult>;
}

const POST_RESOLVE_PREFIX = 'post.resolve.';

/** The pattern of the most recent post-resolve note among the given plates' notes, if any. */
async function previousPatternOf(
  store: CoachNoteStore,
  plates: readonly PlateLog[],
): Promise<CompositionPattern | null> {
  const lists = await Promise.all(
    plates.map((p) => store.forPlate(p.id).catch((): readonly CoachNote[] => [])),
  );
  let latest: CoachNote | null = null;
  for (const note of lists.flat()) {
    if (note.anchor !== 'postResolve' || !note.questionKey.startsWith(POST_RESOLVE_PREFIX)) {
      continue;
    }
    if (latest === null || note.generatedAt > latest.generatedAt) latest = note;
  }
  return latest === null
    ? null
    : parseCompositionPattern(latest.questionKey.slice(POST_RESOLVE_PREFIX.length));
}

export function createCoachNoteGenerator(deps: {
  readonly coach: Coach;
  readonly store: CoachNoteStore;
  readonly clock?: Clock;
  /** Groups a food counts in (mixed dishes count in several). Default: its stored group. */
  readonly groupsOf?: GroupsOf;
}): CoachNoteGenerator {
  const clock = deps.clock ?? systemClock;
  return {
    async generateFor(plate, context) {
      if (plate.entries.length === 0) {
        return { kind: 'noCoachNoteGenerated', reason: 'emptyPlate' };
      }
      const others = otherPlatesOfSameDay(plate, context?.dayPlates ?? []);
      let previousPattern: CompositionPattern | null = null;
      try {
        previousPattern = await previousPatternOf(deps.store, others);
      } catch {
        // No history is the same as a first note of the day.
      }
      const pattern = compositionPatternFor(plate, {
        dayPlates: others,
        previousPattern,
        groupsOf: deps.groupsOf,
      });
      if (pattern === null) return { kind: 'noCoachNoteGenerated', reason: 'unknownPattern' };

      let result: CoachQuestionResult;
      try {
        result = deps.coach.questionFor({ anchor: 'postResolve', pattern });
      } catch {
        return { kind: 'noCoachNoteGenerated', reason: 'coachEmpty' };
      }
      if (result.kind === 'noCoachQuestion') {
        return { kind: 'noCoachNoteGenerated', reason: 'coachEmpty' };
      }
      let appended: CoachNoteAppendResult;
      try {
        appended = await deps.store.append({
          id: 0,
          plateLogId: plate.id,
          anchor: result.question.anchor,
          questionKey: result.question.key,
          text: result.question.text,
          generatedAt: clock(),
        });
      } catch {
        return { kind: 'noCoachNoteGenerated', reason: 'appendFailed' };
      }
      return appended.kind === 'coachNoteAppended'
        ? { kind: 'coachNoteGenerated', note: appended.note, reason: 'matched' }
        : { kind: 'noCoachNoteGenerated', reason: 'appendFailed' };
    },
  };
}
