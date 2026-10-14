import type { RecognitionResult } from '../results/recognition';

/** Photo bytes in, a typed result out. Nothing throws across this port. */
export interface AiRung {
  recognize(photoBytes: Uint8Array): Promise<RecognitionResult>;
}
