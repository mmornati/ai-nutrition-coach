import type { EpochMs } from '../common';
import type { RecognizedFood } from '../value-types/recognized-food';

/**
 * Why recognition failed (the Dart `RecognitionFailure.cause` was an untyped object; these are
 * the causes the BYOK and hosted adapters produce). Plain data: structured-clone safe.
 */
export type RecognitionFailureCause =
  | 'keyMissing'
  | 'keyRejected'
  | 'notConfigured'
  | 'consentRequired'
  | 'photoNotSendable'
  | 'network'
  | 'timeout'
  | 'httpError'
  | 'responseTooLarge'
  | 'invalidResponse'
  | 'unsupported'
  | 'unknown';

/**
 * What an `AiRung` returns. An empty `recognizedPlate` is a legitimate answer, not a failure;
 * `quotaExhausted` is distinct from `recognitionFailure` because the UI routes them differently.
 */
export type RecognitionResult =
  | { readonly kind: 'recognizedPlate'; readonly foods: readonly RecognizedFood[] }
  | { readonly kind: 'noMatch' }
  | {
      readonly kind: 'recognitionFailure';
      readonly cause: RecognitionFailureCause;
      readonly message?: string;
    }
  | { readonly kind: 'quotaExhausted'; readonly resetAt?: EpochMs };

export const recognizedPlate = (foods: readonly RecognizedFood[]): RecognitionResult => ({
  kind: 'recognizedPlate',
  foods,
});
export const NO_MATCH: RecognitionResult = Object.freeze({ kind: 'noMatch' });
export const recognitionFailure = (
  cause: RecognitionFailureCause,
  message?: string,
): RecognitionResult =>
  message === undefined
    ? { kind: 'recognitionFailure', cause }
    : { kind: 'recognitionFailure', cause, message };
export const quotaExhausted = (resetAt?: EpochMs): RecognitionResult =>
  resetAt === undefined ? { kind: 'quotaExhausted' } : { kind: 'quotaExhausted', resetAt };
