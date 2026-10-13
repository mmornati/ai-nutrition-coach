export const TRANSCRIPTION_FAILURE_REASONS = [
  'unsupportedInV1',
  'microphoneDenied',
  'recognizerUnavailable',
  'unknown',
] as const;
export type TranscriptionFailureReason = (typeof TRANSCRIPTION_FAILURE_REASONS)[number];

/** Transcription only; no voice print. */
export type TranscribeResult =
  | { readonly kind: 'transcribedText'; readonly text: string }
  | { readonly kind: 'transcriptionFailure'; readonly reason: TranscriptionFailureReason };

export const transcribedText = (text: string): TranscribeResult => ({
  kind: 'transcribedText',
  text,
});
export const transcriptionFailure = (reason: TranscriptionFailureReason): TranscribeResult => ({
  kind: 'transcriptionFailure',
  reason,
});
