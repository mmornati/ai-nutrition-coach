import {
  recognitionFailure,
  recognizedPlate,
  type AiRung,
  type RecognitionResult,
} from '@anc/core';
import { strings } from '../i18n';

/**
 * No AI, the default and a complete product. Always answers an empty `recognizedPlate`: the rung
 * looked and matched nothing, so the photo path degrades honestly to the closest matches and
 * manual entry with no network call. The bytes are dropped, never stored, hashed or sent.
 */
export class NoopAiRung implements AiRung {
  async recognize(): Promise<RecognitionResult> {
    return recognizedPlate([]);
  }
}

/**
 * The hosted and local rungs: listed as "Not available yet", never selectable, and they make no
 * request. (A hosted tier needs a server-side relay; a credential must never ship in a client.)
 */
export class UnavailableAiRung implements AiRung {
  async recognize(): Promise<RecognitionResult> {
    return recognitionFailure('unsupported', strings().ai.failure.unavailableRung);
  }
}
