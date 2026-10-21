import type { EpochMs } from '../common';
import { syncOp } from '../entities/sync-op';
import type { EncryptedStore } from '../ports/encrypted-store';
import {
  recordPlateSuccess,
  storeFailure,
  type PostCommitWarning,
  type RecordPlateResult,
} from '../results/store';
import { localDayRange } from '../value-types/calendar-day';
import type { PlateLog } from '../entities/plate-log';
import { generateUuidV4, type IdGenerator } from '../util/uuid-v4';
import type { FoodEntryDraft } from '../value-types/food-entry-draft';
import { isValidQuantity } from '../value-types/quantity-range';
import type { CoachNoteGenerator } from './generate-coach-note';
import type { RecordSyncOp } from './record-sync-op';

export interface RecordPlateInput {
  readonly entries: readonly FoodEntryDraft[];
  readonly store: EncryptedStore;
  readonly loggedAtUtc?: EpochMs | undefined;
}

export type RecordPlate = (input: RecordPlateInput) => Promise<RecordPlateResult>;

/**
 * Validate, commit to the store first, then two best-effort post-commit steps (coach note, sync
 * enqueue). A failing or throwing post-commit step is a warning, never a failure: the plate is
 * already committed and a failure result would make the user log it twice.
 */
export function createRecordPlate(deps: {
  readonly generator: CoachNoteGenerator;
  readonly syncOpEnqueue?: RecordSyncOp;
  readonly opIdGenerator?: IdGenerator;
  readonly onWarning?: (warning: PostCommitWarning) => void;
}): RecordPlate {
  const newOpId = deps.opIdGenerator ?? (() => generateUuidV4());

  return async ({ entries, store, loggedAtUtc }) => {
    if (entries.length === 0) return storeFailure('emptyPlate');
    if (entries.some((e) => !isValidQuantity(e.quantity))) return storeFailure('invalidQuantity');

    const result = await store.recordPlate({ entries, loggedAtUtc });
    if (result.kind !== 'recordPlateSuccess') return result;

    const warnings: PostCommitWarning[] = [];
    const plate = result.plateLog;

    try {
      // The coach reads the plate in the context of its own day. If the day cannot be read the
      // plate is judged alone: a note is never held back because of it.
      let dayPlates: readonly PlateLog[] = [];
      try {
        const day = await store.readRange(localDayRange(plate.loggedAtUtc));
        if (day.kind === 'platesRead') dayPlates = day.plates;
      } catch {
        // judged alone
      }
      const generated = await deps.generator.generateFor(plate, { dayPlates });
      if (generated.kind === 'noCoachNoteGenerated' && generated.reason === 'appendFailed') {
        warnings.push({ step: 'coachNote' });
      }
    } catch {
      warnings.push({ step: 'coachNote' });
    }

    if (deps.syncOpEnqueue !== undefined) {
      try {
        const enqueued = await deps.syncOpEnqueue(
          syncOp({
            opId: newOpId(),
            plateLogId: plate.id,
            enqueuedAtUtc: plate.loggedAtUtc,
            kind: 'plateLogCreated',
          }),
        );
        if (enqueued.kind === 'enqueueFailed') warnings.push({ step: 'syncEnqueue' });
      } catch {
        warnings.push({ step: 'syncEnqueue' });
      }
    }

    for (const warning of warnings) {
      try {
        deps.onWarning?.(warning);
      } catch {
        // A throwing sink must not undo a committed plate.
      }
    }

    return warnings.length === 0 ? result : recordPlateSuccess(plate, warnings);
  };
}
