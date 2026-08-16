// `NoopAiRung` — the v1 active rung (Story 1.8 / AD-5 / NFR5).
//
// Always returns `RecognizedPlate(foods: [])` — the rung looked at
// the photo and matched nothing. The UI degrades honestly to
// "closest-matches + manual" without a network call (NFR5). This
// is the spec's chosen shape: an empty list exercises the same
// manual / closest-match surface 1.5 already shipped, so the photo
// path is honest about the absence of a real recognizer in v1.
//
// AD-5: the port shape is the single contract. The core never
// branches on which rung is active; the UI never imports the
// concrete adapter type — it reads `aiRungProvider` and dispatches
// through `AiRung.recognize`. A real recognizer (Epic 3+) drops in
// behind the same provider without touching the screen.
//
// FR13: no biometric identification. This class has no path that
// touches a camera, a face frame, or a device id. The bytes the
// picker produced are dropped — never persisted, never hashed, never
// shipped off-device.

import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';

/// The v1 photo-recognition adapter — always returns the empty
/// recognition shape so the photo path exercises the closest-matches
/// + manual fallback. Constructed at app start; no I/O, no platform
/// channel, no biometric API.
class NoopAiRung implements AiRung {
  const NoopAiRung();

  @override
  Future<RecognitionResult> recognize(Uint8List photoBytes) async {
    // AD-5 + NFR5: the v1 rung never produces a real recognition.
    // Returning `RecognizedPlate(foods: [])` makes the photo path
    // degrade to "closest-matches + manual" without any network
    // call. The `photoBytes` are dropped on the floor by design —
    // a v1 no-op recognizer has no use for them, and persisting
    // them would violate FR13's no-identity-linkage guarantee.
    return const RecognizedPlate(foods: <RecognizedFood>[]);
  }
}
