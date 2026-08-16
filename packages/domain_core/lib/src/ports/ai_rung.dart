// `AiRung` port (AD-5) — every photo recognizer plugs into this
// single seam.
//
// Story 1.8 ships the v1 active rung (`NoopAiRung`) behind this
// port; Epic 3 swaps in real on-device / network recognizers
// (`HostedQuotaAiRung`, `ByokAiRung`, `LocalAiRung`) without the
// core or the UI changing.
//
// AD-5: photo recognition dispatches through the port; the core
// never branches on which rung is active, only on whether a port
// call succeeded. The result is the sealed `RecognitionResult`
// hierarchy (`RecognizedPlate | NoMatch | RecognitionFailure |
// QuotaExhausted`), never a raw exception.
//
// FR6 / FR7 / FR8: four implementations exist behind the port,
// chosen by `AiRungConfig`:
//   * `NoopAiRung`           — `AiRungKind.noOp` (v1 default;
//     Story 1.8).
//   * `HostedQuotaAiRung`    — `AiRungKind.hostedQuota` (Story
//     3.2 / FR6); returns `QuotaExhausted(resetAt: ...)` on quota
//     exhaustion.
//   * `ByokAiRung`           — `AiRungKind.byok` (Story 3.3 /
//     FR7); reads the user's key from on-device encrypted storage
//     and sends it to the configured endpoint on the user's
//     behalf.
//   * `LocalAiRung`          — `AiRungKind.local` (FR8 v2 seam);
//     throws `UnsupportedError` on `recognize` so the seam is
//     declared in the type system and provider wiring without
//     crashing the core.
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
///   * `NoopAiRung`              — v1 active rung (Story 1.8);
///     always returns `RecognizedPlate(foods: [])`. The photo
///     path exercises the closest-matches + manual fallback.
///   * `HostedQuotaAiRung`       — Story 3.2 / FR6; calls the
///     configured free provider within a per-day quota; on
///     exhaustion returns `QuotaExhausted(resetAt: ...)`.
///   * `ByokAiRung`              — Story 3.3 / FR7; reads the
///     user's key from `flutter_secure_storage` and sends it to
///     the configured endpoint.
///   * `LocalAiRung`             — FR8 v2 seam; throws
///     `UnsupportedError` on `recognize` so the seam is honest.
///
/// All four implement [AiRung] so the UI never imports the
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
  ///   * [RecognizedPlate]  — zero or more foods the rung matched.
  ///     An empty list is *not* a failure (see the I/O matrix).
  ///   * [NoMatch]          — the rung saw no food on the plate.
  ///   * [RecognitionFailure] — the adapter could not run. The UI
  ///     renders the calm failure line and still offers the
  ///     closest-matches + manual fallback.
  ///   * [QuotaExhausted]   — the rung's per-day quota is
  ///     exhausted (FR6); the UI renders the calm 3-way choice
  ///     (keep logging without AI / bring your own key / wait for
  ///     reset) — never a spinner, never a countdown.
  ///
  /// Adapters must not throw across this boundary for transport
  /// errors; those are wrapped in [RecognitionFailure] so the UI
  /// can render a single calm message regardless of cause. The
  /// only legitimate throw is the v2-seam `LocalAiRung`, which
  /// throws `UnsupportedError` because the rung is not
  /// implemented in v1 (FR8).
  Future<RecognitionResult> recognize(Uint8List photoBytes);
}
