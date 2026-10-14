import { systemClock, type Clock } from '../common';
import type { PlateLog } from '../entities/plate-log';
import type { Coach } from '../ports/coach';
import type { CoachNoteStore } from '../ports/coach-note-store';
import type {
  CoachNoteAppendResult,
  CoachNoteGenerationResult,
  CoachQuestionResult,
} from '../results/coach';
import type { CompositionPattern } from '../value-types/composition-pattern';

/**
 * The pattern of a plate from its food-group tally, or `null` when no entry has a major group
 * (only `other`), in which case there is nothing to say.
 */
export function compositionPatternFor(plate: PlateLog): CompositionPattern | null {
  let veg = 0;
  let protein = 0;
  let starch = 0;
  let dairy = 0;
  for (const entry of plate.entries) {
    switch (entry.databaseFood.foodGroup) {
      case 'vegFruit':
        veg++;
        break;
      case 'protein':
        protein++;
        break;
      case 'starch':
        starch++;
        break;
      case 'dairy':
        dairy++;
        break;
      case 'other':
        break;
    }
  }
  if (veg + protein + starch + dairy === 0) return null;
  const majorGroupCount = (veg > 0 ? 1 : 0) + (protein > 0 ? 1 : 0) + (starch > 0 ? 1 : 0);
  if (veg === 0) return 'vegLight';
  if (protein >= 2 && protein > veg) return 'proteinHeavy';
  if (starch >= 2 && starch > veg) return 'starchHeavy';
  if (veg >= 2 && protein === 0) return 'vegRich';
  if (dairy === 0 && majorGroupCount <= 1) return 'dairyLight';
  return 'balanced';
}

export interface CoachNoteGenerator {
  /** Never throws: every failure is a `noCoachNoteGenerated` with a reason. */
  generateFor(plate: PlateLog): Promise<CoachNoteGenerationResult>;
}

export function createCoachNoteGenerator(deps: {
  readonly coach: Coach;
  readonly store: CoachNoteStore;
  readonly clock?: Clock;
}): CoachNoteGenerator {
  const clock = deps.clock ?? systemClock;
  return {
    async generateFor(plate) {
      if (plate.entries.length === 0) {
        return { kind: 'noCoachNoteGenerated', reason: 'emptyPlate' };
      }
      const pattern = compositionPatternFor(plate);
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
