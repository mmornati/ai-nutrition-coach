// `VoiceTranscriber` port (FR3 / FR13) — transcription only, no
// voice-print, no biometric identification.
//
// The port is parameterless in v1: the no-op adapter never captures
// audio, and the screen surfaces the "Voice not available in v1 — type
// instead" quiet copy on tap. A future story will extend the port to
// take audio bytes (`Uint8List` or `Stream<Uint8List>`) when a real
// `speech_to_text`-backed adapter is wired — the seam stays the same,
// only the signature widens.
//
// No audio is persisted to disk by any adapter under this port. The
// contract is structural — adapters that capture audio hold it briefly
// in memory for transcription and never write it to a file.

/// Reasons a `VoiceTranscriber` call can fail. The discriminated enum
/// keeps the UI copy calm and accurate (UX-DR10 / FR13):
///   * [unsupportedInV1]    — the seam is wired but the v1 adapter is
///     a no-op. The UI shows "Voice not available in v1 — type instead".
///   * [microphoneDenied]   — the user denied microphone permission.
///   * [recognizerUnavailable] — the platform speech recognizer is down.
///   * [unknown]            — catch-all; the UI shows the same calm copy
///     as [microphoneDenied] and the adapter logs the raw cause.
enum TranscriptionFailureReason {
  unsupportedInV1,
  microphoneDenied,
  recognizerUnavailable,
  unknown,
}

/// Typed result of a `VoiceTranscriber.transcribe` call.
sealed class TranscribeResult {
  const TranscribeResult();
}

/// Successful transcription. [text] is the recogniser's best-effort
/// string the UI feeds into the manual-entry text field.
class TranscribedText extends TranscribeResult {
  const TranscribedText(this.text);

  final String text;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is TranscribedText && other.text == text);

  @override
  int get hashCode => Object.hash('TranscribedText', text);

  @override
  String toString() => 'TranscribedText("$text")';
}

/// Typed failure across the voice port. Carries a discriminated
/// [TranscriptionFailureReason] so the UI can pick the right calm
/// copy without inspecting a string.
class TranscriptionFailure extends TranscribeResult {
  const TranscriptionFailure(this.reason);

  final TranscriptionFailureReason reason;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is TranscriptionFailure && other.reason == reason);

  @override
  int get hashCode => Object.hash('TranscriptionFailure', reason);

  @override
  String toString() => 'TranscriptionFailure($reason)';
}

/// The voice-transcription port. Adapters live in
/// `packages/integrations`:
///   * `NoopVoiceTranscriber` — Story 1.5 ships a no-op that always
///     returns [TranscriptionFailure] with
///     [TranscriptionFailureReason.unsupportedInV1].
///   * `SpeechToTextTranscriber` — Epic 3+ wraps `speech_to_text`
///     behind this same port.
abstract interface class VoiceTranscriber {
  /// Attempt to transcribe a single utterance. The call returns once
  /// the adapter has either resolved a [TranscribedText] or surfaced
  /// a typed [TranscriptionFailure].
  ///
  /// Implementations must not persist audio to disk (FR3 / FR13).
  Future<TranscribeResult> transcribe();
}
