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
  /**
   * Edits a logged plate: its entries and time are replaced by `entries` / `loggedAtUtc`. ONE
   * transaction: the old plate with its entries, coach notes, interactions and dismissals is
   * deleted (tombstones, which always win a merge) and the new plate is created under new uids,
   * so every device converges on the edited version and none resurrects the old one. The plate
   * comes back with a NEW id. Two devices that edit the same plate at once each produce a new
   * plate: both survive (nothing is lost) and the person can remove one. A plate that no longer
   * exists (deleted here or by another device meanwhile) is refused with `notFound` and nothing
   * is written, so the edit does not bring it back.
   */
  replacePlate(input: {
    readonly plateLogId: number;
    readonly entries: readonly FoodEntryDraft[];
    readonly loggedAtUtc: EpochMs;
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
