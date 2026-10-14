import type { CoachNote } from '../entities/coach-note';
import type { CoachInteractionResult, CoachNoteAppendResult } from '../results/coach';
import type { DeletePlateResult } from '../results/store';
import type { Unsubscribe } from '../common';
import type { CoachInteractionLog } from '../value-types/coach-interaction';
import type { StoreObserver } from './observer';

/** Append-only coach notes, interaction log and durable dismissal markers. */
export interface CoachNoteStore {
  append(note: CoachNote): Promise<CoachNoteAppendResult>;
  forPlate(plateLogId: number): Promise<readonly CoachNote[]>;
  watchForPlate(plateLogId: number, observer: StoreObserver<readonly CoachNote[]>): Unsubscribe;
  recordDismissal(key: string): Promise<CoachInteractionResult>;
  watchDismissals(observer: StoreObserver<ReadonlySet<string>>): Unsubscribe;
  recordInteraction(log: CoachInteractionLog): Promise<CoachInteractionResult>;
  /**
   * Deletes every note, interaction and dismissal of the plate. Idempotent: a no-op safety net
   * when `EncryptedStore.deletePlate` already removed them in its single transaction.
   */
  deleteForPlate(plateLogId: number): Promise<DeletePlateResult>;
}
