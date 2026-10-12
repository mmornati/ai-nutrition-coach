// Stores handed out when the encrypted database could not be opened
// (Phase 2A / D1, D7, D10).
//
// They replace the old `_SecureKeyFailureStore`: same containment idea
// (the UI gets a typed, calm failure instead of an uncaught async
// error) but the failure is the REAL one — `KeyLostFailure` for a lost
// key, `SecureKeyFailure` for a key / cipher problem,
// `StoreOperationFailure` otherwise — and nothing is ever written
// anywhere.

import 'package:domain_core/domain_core.dart';

/// `EncryptedStore` that refuses every operation with [failure].
class FailedEncryptedStore implements EncryptedStore {
  const FailedEncryptedStore(this.failure);

  final StoreFailure failure;

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async => failure;

  @override
  Stream<List<PlateLog>> watchRange({
    required DateTime from,
    required DateTime to,
  }) => Stream<List<PlateLog>>.error(StoreStreamException(failure));

  @override
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to}) async =>
      PlatesReadFailed(failure);

  @override
  Future<DeletePlateResult> deletePlate(int plateLogId) async =>
      PlateDeleteFailed(failure);

  @override
  Future<void> close() async {}
}

/// `CoachNoteStore` paired with [FailedEncryptedStore].
class FailedCoachNoteStore implements CoachNoteStore {
  const FailedCoachNoteStore(this.failure);

  final StoreFailure failure;

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async =>
      CoachNoteAppendFailure(failure);

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async => const [];

  @override
  Stream<List<CoachNote>> watchForPlate(int plateLogId) =>
      Stream<List<CoachNote>>.value(const []);

  @override
  Future<CoachInteractionResult> recordDismissal(String key) async =>
      CoachInteractionFailed(failure);

  @override
  Stream<Set<String>> watchDismissals() =>
      Stream<Set<String>>.value(const <String>{});

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async => CoachInteractionFailed(failure);

  @override
  Future<DeletePlateResult> deleteForPlate(int plateLogId) async =>
      PlateDeleteFailed(failure);
}
