// "Erase all local data" port (Phase 2A / D8 / AD-8).
//
// One explicit, user-initiated action that returns the device to a
// first-run state: the encrypted store (file and sidecars), every
// secure-storage alias (database key, BYOK key, quota counters, rung
// config) and every export file written by this app. It is also the
// recovery path for a lost database key (`KeyLostFailure`, D7).
//
// The adapter lives in `packages/integrations`. The port never throws:
// every outcome is a typed `EraseLocalDataResult`.
//
// AD-1: pure Dart; no Flutter / SQLite / IO imports.

import '../results/erase_failure.dart';

abstract interface class LocalDataEraser {
  /// Erase everything OpenPlate persists on this device. Best-effort
  /// across steps: a failing step does not stop the later ones, and the
  /// result names every step that failed.
  Future<EraseLocalDataResult> eraseAll();
}
