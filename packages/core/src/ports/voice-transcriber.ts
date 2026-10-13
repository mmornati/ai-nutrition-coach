import type { TranscribeResult } from '../results/transcribe';

/** A no-op seam in v1: the mic says "Voice not available in v1, type instead". */
export interface VoiceTranscriber {
  transcribe(): Promise<TranscribeResult>;
}
