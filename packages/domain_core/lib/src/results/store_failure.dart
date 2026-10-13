// Typed results crossing the `EncryptedStore` port (conventions.md).
//
// `StoreFailure` is a single class with three discriminated fields rather
// than a deep sealed hierarchy — callers pattern-match by which field is
// non-null, which keeps the call sites compact and matches the I/O matrix
// (each scenario owns exactly one of the three fields). The marker types
// `UnsupportedPlatformFailure`, `EmptyPlateFailure`, and the
// `EncryptedStoreFailure` sealed family (`SecureKeyFailure` on mobile,
// `WebSessionKeyFailure` on web) are the only valid arguments to those
// fields, so a typo at the call site is a compile error.

import '../entities/plate_log.dart';

sealed class RecordPlateResult {
  const RecordPlateResult();
}

/// Successful commit — `plateLog` carries the assigned `id` and the
/// resolved entries with their `plateLogId`s. The UI sees this before
/// any provider reflects it (AD-3).
///
/// The plate IS committed whenever this is returned. `warnings` lists the
/// best-effort steps that ran after the commit and did not complete (coach
/// note, sync enqueue — security review F7); it is empty on a clean run. A
/// warning is information, never a reason to treat the log as failed.
class RecordPlateSuccess extends RecordPlateResult {
  const RecordPlateSuccess(
    this.plateLog, {
    this.warnings = const <PostCommitWarning>[],
  });

  final PlateLog plateLog;

  /// Post-commit steps that did not complete. Empty when all went well.
  final List<PostCommitWarning> warnings;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RecordPlateSuccess &&
          other.plateLog == plateLog &&
          _sameWarnings(other.warnings, warnings));

  @override
  int get hashCode =>
      Object.hash(RecordPlateSuccess, plateLog, Object.hashAll(warnings));

  @override
  String toString() =>
      'RecordPlateSuccess(plateLog: $plateLog, warnings: $warnings)';
}

bool _sameWarnings(List<PostCommitWarning> a, List<PostCommitWarning> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

/// A best-effort step that follows the plate commit in `RecordPlate`.
enum PostCommitStep { coachNote, syncEnqueue }

/// One post-commit step that failed or threw. Carries no cause text.
class PostCommitWarning {
  const PostCommitWarning(this.step);

  final PostCommitStep step;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PostCommitWarning && other.step == step);

  @override
  int get hashCode => Object.hash(PostCommitWarning, step);

  @override
  String toString() => 'PostCommitWarning($step)';
}

/// What a range read of the plates returns (`EncryptedStore.readRange`).
sealed class ReadPlatesResult {
  const ReadPlatesResult();
}

/// The plates in the range, newest first.
class PlatesRead extends ReadPlatesResult {
  const PlatesRead(this.plates);

  final List<PlateLog> plates;
}

/// The read failed with a typed [failure] (web session locked, storage
/// error, ...). Never carries cause text.
class PlatesReadFailed extends ReadPlatesResult {
  const PlatesReadFailed(this.failure);

  final StoreFailure failure;
}

/// What `EncryptedStore.deletePlate` / `CoachNoteStore.deleteForPlate`
/// return (privacy audit PV5). Never thrown: a failure is typed.
sealed class DeletePlateResult {
  const DeletePlateResult();
}

/// The plate (or its coach notes) is gone. Deleting an id that does not exist
/// is also a success: the goal state ("it is not there") holds.
class PlateDeleted extends DeletePlateResult {
  const PlateDeleted();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is PlateDeleted;

  @override
  int get hashCode => (PlateDeleted).hashCode;

  @override
  String toString() => 'PlateDeleted()';
}

/// The delete did not happen; nothing was removed that is not also reported.
class PlateDeleteFailed extends DeletePlateResult {
  const PlateDeleteFailed(this.failure);

  final StoreFailure failure;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is PlateDeleteFailed && other.failure == failure);

  @override
  int get hashCode => Object.hash(PlateDeleteFailed, failure);

  @override
  String toString() => 'PlateDeleteFailed($failure)';
}

/// Typed failure across the store port. Exactly one of the three fields
/// is non-null for a well-formed failure; the constructor `assert`s that.
class StoreFailure extends RecordPlateResult {
  const StoreFailure({
    this.platformError,
    this.validationError,
    this.encryptedStoreError,
  }) : assert(
         (platformError == null ? 0 : 1) +
                 (validationError == null ? 0 : 1) +
                 (encryptedStoreError == null ? 0 : 1) ==
             1,
         'StoreFailure must have exactly one failure field set',
       );

  /// The current build target does not implement the encrypted store —
  /// used by `WebEncryptedStoreStub` (the v0 web stub) before
  /// Story 4.1 lands. Story 4.1 ships a real wasm-backed store.
  final UnsupportedPlatformFailure? platformError;

  /// Use-case-level validation refusal — the empty-plate guard and the
  /// invalid-quantity guard from `RecordPlate`.
  final PlateValidationFailure? validationError;

  /// Adapter-level key handling failure — read or write to
  /// `flutter_secure_storage` under `ai_nutrition_coach_db_key_v1` failed
  /// (mobile), or the web session is locked and the user has not
  /// entered a passphrase yet (Story 4.1 / AD-8). The field is
  /// sealed: only the `EncryptedStoreFailure` family is valid
  /// (`SecureKeyFailure`, `KeyLostFailure`, `StoreOperationFailure` on
  /// mobile; `WebSessionKeyFailure` on web).
  final EncryptedStoreFailure? encryptedStoreError;

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! StoreFailure) return false;
    return other.platformError == platformError &&
        other.validationError == validationError &&
        other.encryptedStoreError == encryptedStoreError;
  }

  @override
  int get hashCode =>
      Object.hash(platformError, validationError, encryptedStoreError);

  @override
  String toString() =>
      'StoreFailure('
      'platformError: $platformError, '
      'validationError: $validationError, '
      'encryptedStoreError: $encryptedStoreError)';
}

class UnsupportedPlatformFailure {
  const UnsupportedPlatformFailure();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is UnsupportedPlatformFailure;

  @override
  int get hashCode => (UnsupportedPlatformFailure).hashCode;

  @override
  String toString() => 'UnsupportedPlatformFailure()';
}

/// Why `RecordPlate` refused a plate before touching the store.
sealed class PlateValidationFailure {
  const PlateValidationFailure();
}

class EmptyPlateFailure implements PlateValidationFailure {
  const EmptyPlateFailure();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is EmptyPlateFailure;

  @override
  int get hashCode => (EmptyPlateFailure).hashCode;

  @override
  String toString() => 'EmptyPlateFailure()';
}

/// An entry's quantity is not a finite, non-negative `low <= high` range.
class InvalidQuantityFailure implements PlateValidationFailure {
  const InvalidQuantityFailure();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is InvalidQuantityFailure;

  @override
  int get hashCode => (InvalidQuantityFailure).hashCode;

  @override
  String toString() => 'InvalidQuantityFailure()';
}

class SecureKeyFailure implements EncryptedStoreFailure {
  const SecureKeyFailure();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is SecureKeyFailure;

  @override
  int get hashCode => (SecureKeyFailure).hashCode;

  @override
  String toString() => 'SecureKeyFailure()';
}

/// Story 4.1 / AD-8 — the web session is locked. The user has not
/// entered a passphrase yet, or the session was reset (page reload).
/// The `WasmEncryptedStore` returns this typed failure rather than
/// throwing a raw exception so the UI can render the calm
/// "unlock the store first" line.
class WebSessionKeyFailure implements EncryptedStoreFailure {
  const WebSessionKeyFailure();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is WebSessionKeyFailure;

  @override
  int get hashCode => (WebSessionKeyFailure).hashCode;

  @override
  String toString() => 'WebSessionKeyFailure()';
}

/// Phase 2A / D7 — the database file exists on this device but its key
/// does not (the Keychain / Keystore entry was lost: restored backup,
/// keystore reset, new device). The data cannot be opened and silently
/// minting a new key would only bury it, so the factory reports this
/// distinct state and the UI offers the explicit "Erase local data and
/// start over" action (D8). Never carries key material.
class KeyLostFailure implements EncryptedStoreFailure {
  const KeyLostFailure();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is KeyLostFailure;

  @override
  int get hashCode => (KeyLostFailure).hashCode;

  @override
  String toString() => 'KeyLostFailure()';
}

/// Phase 2A / D10 — a storage-layer failure that is NOT a key or cipher
/// problem (disk full, locked database, corrupt page, ...). Mapped from
/// the underlying exception by cause so the UI is never told "key
/// problem" for an unrelated SQL error. Carries no cause text: the raw
/// message can contain SQL or paths.
class StoreOperationFailure implements EncryptedStoreFailure {
  const StoreOperationFailure();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is StoreOperationFailure;

  @override
  int get hashCode => (StoreOperationFailure).hashCode;

  @override
  String toString() => 'StoreOperationFailure()';
}

/// The typed error a store's `watchRange` stream (or a coach-note watch
/// stream) emits instead of a raw adapter exception (D10). Streams have
/// no result channel, so the typed [failure] rides the error channel;
/// consumers (`AsyncValue.error` in the client) never see SQLite, drift
/// or isolate types.
class StoreStreamException implements Exception {
  const StoreStreamException(this.failure);

  final StoreFailure failure;

  @override
  String toString() => 'StoreStreamException($failure)';
}

/// Sealed marker for any failure that originates in the encrypted
/// store's key handling. Mobile returns `SecureKeyFailure` (Keychain
/// read/write under `ai_nutrition_coach_db_key_v1` failed, or the cipher / key
/// could not be applied), `KeyLostFailure` (database present, key gone)
/// or `StoreOperationFailure` (any other storage error); web returns
/// `WebSessionKeyFailure` (the session is locked, AD-8). All shapes
/// ride the same `StoreFailure.encryptedStoreError` field so the UI
/// can pattern-match with a single check.
sealed class EncryptedStoreFailure {
  const EncryptedStoreFailure();
}
