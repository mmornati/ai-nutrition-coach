// Typed results crossing the `EncryptedStore` port (conventions.md).
//
// `StoreFailure` is a single class with three discriminated fields rather
// than a deep sealed hierarchy — callers pattern-match by which field is
// non-null, which keeps the call sites compact and matches the I/O matrix
// (each scenario owns exactly one of the three fields). The marker types
// `UnsupportedPlatformFailure`, `EmptyPlateFailure`, `SecureKeyFailure`
// are the only valid arguments to those fields, so a typo at the call
// site is a compile error.

import '../entities/plate_log.dart';

sealed class RecordPlateResult {
  const RecordPlateResult();
}

/// Successful commit — `plateLog` carries the assigned `id` and the
/// resolved entries with their `plateLogId`s. The UI sees this before
/// any provider reflects it (AD-3).
class RecordPlateSuccess extends RecordPlateResult {
  const RecordPlateSuccess(this.plateLog);

  final PlateLog plateLog;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is RecordPlateSuccess && other.plateLog == plateLog);

  @override
  int get hashCode => Object.hash(RecordPlateSuccess, plateLog);

  @override
  String toString() => 'RecordPlateSuccess(plateLog: $plateLog)';
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
  /// used by `WebEncryptedStoreStub` until Story 4.1 (sqlite3.wasm + PBKDF2).
  final UnsupportedPlatformFailure? platformError;

  /// Use-case-level validation refusal — currently only the empty-plate
  /// guard from `RecordPlate`.
  final EmptyPlateFailure? validationError;

  /// Adapter-level key handling failure — read or write to
  /// `flutter_secure_storage` under `openplate_db_key_v1` failed.
  final SecureKeyFailure? encryptedStoreError;

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
  String toString() => 'StoreFailure('
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

class EmptyPlateFailure {
  const EmptyPlateFailure();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is EmptyPlateFailure;

  @override
  int get hashCode => (EmptyPlateFailure).hashCode;

  @override
  String toString() => 'EmptyPlateFailure()';
}

class SecureKeyFailure {
  const SecureKeyFailure();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is SecureKeyFailure;

  @override
  int get hashCode => (SecureKeyFailure).hashCode;

  @override
  String toString() => 'SecureKeyFailure()';
}
