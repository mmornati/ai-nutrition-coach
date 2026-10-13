import type { CoachNoteStore } from '../ports/coach-note-store';
import type { EncryptedStore } from '../ports/encrypted-store';
import { plateDeleteFailed, storeFailure, type DeletePlateResult } from '../results/store';

export type DeletePlate = (plateLogId: number) => Promise<DeletePlateResult>;

/**
 * Deletes one plate. `EncryptedStore.deletePlate` removes entries, plate, coach notes,
 * interactions and dismissals in ONE transaction (all-or-nothing). The follow-up
 * `CoachNoteStore.deleteForPlate` is an idempotent no-op safety net for stores that keep notes
 * elsewhere (in-memory dev store, test fakes). A failed first step stops the second; an adapter
 * that throws collapses to a typed failure. The Phase 4 adapter must pass a port-contract test
 * for the single-transaction guarantee.
 */
export function createDeletePlate(deps: {
  readonly store: EncryptedStore;
  readonly coachNotes: CoachNoteStore;
}): DeletePlate {
  return async (plateLogId) => {
    try {
      const plate = await deps.store.deletePlate(plateLogId);
      if (plate.kind === 'plateDeleteFailed') return plate;
      return await deps.coachNotes.deleteForPlate(plateLogId);
    } catch {
      return plateDeleteFailed(storeFailure('storeOperation'));
    }
  };
}
