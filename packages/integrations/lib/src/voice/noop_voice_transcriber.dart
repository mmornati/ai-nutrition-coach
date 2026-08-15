// No-op `VoiceTranscriber` adapter (Story 1.5 / FR3 / FR13).
//
// Always returns `TranscriptionFailure(unsupportedInV1)`. The seam is
// wired so the manual-entry screen can render the calm "Voice not
// available in v1 — type instead" copy on tap; no audio is ever
// captured and no recogniser is initialised in v1.
//
// The "no voice-print anywhere" guarantee is preserved by construction:
// this class has no path that touches a microphone, an audio buffer, or
// a biometric API. A future Epic 3 adapter will swap this for a real
// `speech_to_text`-backed implementation behind the same
// `VoiceTranscriber` port — the screen and the provider chain stay
// the same.

import 'package:domain_core/domain_core.dart';

/// The v1 voice-transcriber adapter — always declines with
/// [TranscriptionFailureReason.unsupportedInV1]. Safe to construct at
/// app start; no I/O, no platform channel.
class NoopVoiceTranscriber implements VoiceTranscriber {
  const NoopVoiceTranscriber();

  @override
  Future<TranscribeResult> transcribe() async {
    return const TranscriptionFailure(
      TranscriptionFailureReason.unsupportedInV1,
    );
  }
}
