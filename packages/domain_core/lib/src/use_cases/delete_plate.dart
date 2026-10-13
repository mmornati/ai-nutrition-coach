// `DeletePlate` use case (privacy audit PV5).
//
// Removes ONE plate and everything that hangs off it. The real stores
// (`EncryptedStoreAdapter` / `WasmEncryptedStore`) do it all in a single
// database transaction inside `deletePlate` (entries, plate, coach notes,
// interactions, dismissals), so a failure rolls back and nothing is
// half-deleted. The use case then also asks `CoachNoteStore.deleteForPlate`,
// an idempotent no-op there, so stores that keep the notes elsewhere (the
// in-memory dev store, test fakes) cascade too.
//
// Never throws: an adapter that throws anyway is collapsed to a typed
// failure so the UI shows one calm line.
//
// AD-1: pure Dart.

import '../ports/coach_note_store.dart';
import '../ports/encrypted_store.dart';
import '../results/store_failure.dart';

class DeletePlate {
  const DeletePlate({
    required EncryptedStore store,
    required CoachNoteStore coachNotes,
  }) : _store = store,
       _coachNotes = coachNotes;

  final EncryptedStore _store;
  final CoachNoteStore _coachNotes;

  Future<DeletePlateResult> call(int plateLogId) async {
    try {
      final plate = await _store.deletePlate(plateLogId);
      if (plate is PlateDeleteFailed) return plate;
      return await _coachNotes.deleteForPlate(plateLogId);
    } on Exception {
      return const PlateDeleteFailed(
        StoreFailure(encryptedStoreError: StoreOperationFailure()),
      );
    }
  }
}
