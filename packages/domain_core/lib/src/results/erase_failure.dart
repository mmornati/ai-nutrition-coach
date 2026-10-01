// Typed "erase all local data" results (Phase 2A / D8).
//
// Sealed `EraseLocalDataResult` with `EraseLocalDataSuccess` /
// `EraseLocalDataFailure`, following the `ExportResult` / `StoreFailure`
// envelope convention: the use case never throws, the UI pattern-matches.
//
// AD-1: pure Dart.

/// One step of the erase sequence. Used to tell the user (and tests)
/// exactly what could not be removed.
enum EraseStep {
  /// Closing the open database handle.
  closeStore,

  /// Deleting the database file and its `-wal` / `-shm` / `-journal`
  /// sidecars.
  databaseFiles,

  /// Deleting every secure-storage alias (DB key, BYOK key, quota
  /// counters, rung config).
  secureStorage,

  /// Deleting export files written by this app.
  exportFiles,
}

sealed class EraseLocalDataResult {
  const EraseLocalDataResult();
}

/// Everything was removed; the device is back to a first-run state.
class EraseLocalDataSuccess extends EraseLocalDataResult {
  const EraseLocalDataSuccess();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is EraseLocalDataSuccess;

  @override
  int get hashCode => (EraseLocalDataSuccess).hashCode;

  @override
  String toString() => 'EraseLocalDataSuccess()';
}

/// At least one step failed. [failedSteps] is never empty. No cause text
/// is carried: paths and platform messages stay out of the UI layer.
class EraseLocalDataFailure extends EraseLocalDataResult {
  EraseLocalDataFailure(Iterable<EraseStep> failedSteps)
    : failedSteps = List.unmodifiable(failedSteps);

  final List<EraseStep> failedSteps;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is EraseLocalDataFailure &&
          other.failedSteps.toSet().difference(failedSteps.toSet()).isEmpty &&
          failedSteps.toSet().difference(other.failedSteps.toSet()).isEmpty);

  @override
  int get hashCode => Object.hashAllUnordered(failedSteps.toSet());

  @override
  String toString() => 'EraseLocalDataFailure($failedSteps)';
}
