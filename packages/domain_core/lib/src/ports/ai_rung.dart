// `AiRung` port (AD-5) — every photo recognizer plugs into this
// single seam.
//
// Story 1.8 ships the v1 active rung (`NoopAiRung`) behind this
// port; Epic 3 swaps in real on-device / network recognizers
// (`OnDeviceClassifierRung`, `CloudRung`, …) without the core or
// the UI changing.
//
// AD-5: photo recognition dispatches through the port; the core
// never branches on which rung is active, only on whether a port
// call succeeded. The result is the sealed `RecognitionResult`
// hierarchy (`RecognizedPlate | NoMatch | RecognitionFailure`),
// never a raw exception.
//
// FR13: no biometric identification anywhere on this path. Adapters
// are forbidden from running face / voice biometric classifiers;
// the contract is structural — the port takes raw photo bytes and
// returns a list of foods, nothing else.
//
// The input is `Uint8List` rather than a `File` so the port is
// platform-agnostic and adapter tests can hand the adapter a
// in-memory byte buffer without touching the filesystem.

import 'dart:typed_data';

import '../results/recognition_failure.dart';

/// The single sanctioned photo-recognition port (AD-5).
///
/// Adapters live in `packages/integrations`:
///   * `NoopAiRung`              — Story 1.8 ships a no-op that
///     always returns `RecognizedPlate(foods: [])`. The photo path
///     exercises the closest-matches + manual fallback. AD-5
///     holds because the rung is injected via Riverpod — the core
///     and the UI never know which rung is active.
///   * `OnDeviceClassifierRung`  — Epic 3+ wraps an on-device
///     model behind the same port.
///   * `CloudRung`               — Epic 3+ wraps a network call
///     behind the same port.
///
/// All three implement [AiRung] so the UI never imports the
/// concrete adapter type — only this interface.
abstract interface class AiRung {
  /// Resolve the foods on a plate from raw photo bytes.
  ///
  /// [photoBytes] is the verbatim photo payload the picker
  /// produced (the picker never persists the file outside its own
  /// contract; the bytes travel in-memory to the rung and then
  /// are dropped).
  ///
  /// Returns:
  ///   * [RecognizedPlate] — zero or more foods the rung matched.
  ///     An empty list is *not* a failure (see the I/O matrix).
  ///   * [NoMatch]         — the rung saw no food on the plate.
  ///   * [RecognitionFailure] — the adapter could not run. The UI
  ///     renders the calm failure line and still offers the
  ///     closest-matches + manual fallback.
  ///
  /// Adapters must not throw across this boundary; transport
  /// errors are wrapped in [RecognitionFailure] so the UI can
  /// render a single calm message regardless of cause.
  Future<RecognitionResult> recognize(Uint8List photoBytes);
}
