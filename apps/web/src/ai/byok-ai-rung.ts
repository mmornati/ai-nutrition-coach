import {
  NO_MATCH,
  quotaExhausted,
  recognitionFailure,
  recognizedPlate,
  type AiRung,
  type RecognitionResult,
} from '@anc/core';
import { strings } from '../i18n';
import type { ByokKeyStore } from './byok-key-store';
import type { ByokProvider } from './types';

/**
 * The BYOK rung. Reads the user's key from the (host-bound) key store and hands it to the
 * transport. On a missing key it returns the calm "key missing" failure BEFORE any request.
 * The key never appears in any string the rung produces and `toString` is redacted. A rejected
 * key (401/403) is kept (no auto-clear) so the person can fix it without re-entering it.
 *
 * Do not hand this rung to the UI directly: the rung registry always wraps it in the consent
 * gate (`ConsentGatedAiRung`), which is what makes the "no photo without a yes" rule hold.
 */
export class ByokAiRung implements AiRung {
  readonly #keyStore: ByokKeyStore;
  readonly #provider: ByokProvider;

  constructor(args: { keyStore: ByokKeyStore; provider: ByokProvider }) {
    this.#keyStore = args.keyStore;
    this.#provider = args.provider;
  }

  async recognize(photoBytes: Uint8Array): Promise<RecognitionResult> {
    const t = strings().ai.failure;
    const missing = recognitionFailure('keyMissing', t.keyMissing);
    let apiKey: string | null;
    try {
      if (!(await this.#keyStore.hasKey())) return missing;
      apiKey = await this.#keyStore.read();
    } catch {
      return missing;
    }
    if (apiKey === null || apiKey === '') return missing;

    // The rung never throws across the AiRung port: a transport error is a failure result.
    let outcome;
    try {
      outcome = await this.#provider.recognize({ photoBytes, apiKey });
    } catch {
      return recognitionFailure('unknown', t.unreachable);
    }
    switch (outcome.kind) {
      case 'recognized':
        return recognizedPlate(outcome.foods);
      case 'noMatch':
        return NO_MATCH;
      case 'keyRejected':
        return recognitionFailure('keyRejected', t.keyRejected);
      case 'quotaExhausted':
        return quotaExhausted(outcome.resetAt);
      case 'failure':
        return recognitionFailure(outcome.cause, outcome.message);
    }
  }

  toString(): string {
    return 'ByokAiRung()';
  }
}
