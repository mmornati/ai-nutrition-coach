import type { EpochMs, Unsubscribe } from '../common';
import type { PlateLog } from '../entities/plate-log';
import type { DeletePlateResult, ReadPlatesResult, RecordPlateResult } from '../results/store';
import type { FoodEntryDraft } from '../value-types/food-entry-draft';
import type { StoreObserver } from './observer';

export interface EncryptedStore {
  recordPlate(input: {
    readonly entries: readonly FoodEntryDraft[];
    readonly loggedAtUtc?: EpochMs | undefined;
  }): Promise<RecordPlateResult>;
  /** Half-open `[from, to)` on `loggedAtUtc`, newest first. */
  watchRange(
    range: { readonly from: EpochMs; readonly to: EpochMs },
    observer: StoreObserver<readonly PlateLog[]>,
  ): Unsubscribe;
  readRange(range?: {
    readonly from?: EpochMs | undefined;
    readonly to?: EpochMs | undefined;
  }): Promise<ReadPlatesResult>;
  /**
   * Removes the plate's entries, the plate, its coach notes, interactions and dismissals in ONE
   * transaction: all-or-nothing, so a failure rolls back and nothing is half-deleted.
   * `CoachNoteStore.deleteForPlate` is only an idempotent no-op safety net for stores that keep
   * notes elsewhere. The Phase 4 adapter must pass a port-contract test for this atomicity.
   */
  deletePlate(plateLogId: number): Promise<DeletePlateResult>;
  close(): Promise<void>;
}
