// `LocalAiRung` — the v2 AI rung seam (Story 3.1 / FR8).
//
// The local-model rung is declared in the type system (`AiRungKind
// .local`) and the provider graph, but the v1 adapter throws
// `UnsupportedError` on `recognize`. The seam is honest about its
// v2 status — the enum is a first-class value, the adapter is
// constructible, and a future v2 implementation drops in behind the
// same port without touching the core or the UI (AD-5).
//
// FR8: the local-model rung is reserved for v2; v1 has no local-
// model implementation. Throwing `UnsupportedError` (rather than
// returning `RecognitionFailure`) is deliberate — the error is the
// seam's contract, not a transient transport failure the UI
// should retry.
//
// FR13: no biometric identification. The local rung has no path
// that touches a camera, a face frame, or a device id.
//
// AD-5: the port shape is the single contract. The core never
// branches on which rung is active; the UI never imports the
// concrete adapter type — it reads `aiRungProvider` and dispatches
// through `AiRung.recognize`. A v2 `LocalAiRung` swaps the body
// of this class without changing the port or the call sites.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';

/// The v2 local-model rung seam (FR8). The v1 adapter throws
/// `UnsupportedError` on `recognize` so the type system and
/// provider wiring are honest about the seam without crashing the
/// core or the UI.
///
/// Constructed at app start (the v1 default build never selects this
/// rung — `AiRungConfig.kind == AiRungKind.local` is reserved for v2).
class LocalAiRung implements AiRung {
  const LocalAiRung();

  @override
  Future<RecognitionResult> recognize(Uint8List photoBytes) async {
    // FR8: the local-model rung is a v2 seam. Throwing
    // `UnsupportedError` (not `RecognitionFailure`) is the seam's
    // contract — the error is structural, not a transport failure
    // the UI should retry. The photo bytes are dropped on the
    // floor by design (FR13 carries over from Story 1.8).
    throw UnsupportedError(
      'LocalAiRung is a v2 seam (FR8) — the local-model rung is '
      'not implemented in v1.',
    );
  }
}