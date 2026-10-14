import { recognitionFailure, type AiRung, type RecognitionResult } from '@anc/core';
import { strings } from '../i18n';
import type { PhotoUploadPermit } from './photo-upload-permit';

/**
 * Refuses to recognise (and so never uploads) unless the person agreed to photos going to
 * `host`. The capture flow asks first; this guard makes the rule hold even if some other path
 * reaches the rung.
 *
 * With "Ask before every photo upload" on (the default) the per-host agreement is not enough:
 * each photo needs its own one-shot permit, granted after the person said yes for that photo.
 * A missing permit object fails closed.
 */
export class ConsentGatedAiRung implements AiRung {
  readonly #inner: AiRung;
  readonly #hasConsent: () => boolean;
  readonly #askEveryPhoto: (() => boolean) | undefined;
  readonly #permit: PhotoUploadPermit | undefined;
  readonly #host: string;

  constructor(args: {
    readonly inner: AiRung;
    /** Evaluated at call time, so a revoke takes effect immediately. */
    readonly hasConsent: () => boolean;
    /** Evaluated at call time. `undefined` means "no per-photo mode". */
    readonly askEveryPhoto?: () => boolean;
    readonly permit?: PhotoUploadPermit;
    /** The host the permit must have been granted for. */
    readonly host?: string;
  }) {
    this.#inner = args.inner;
    this.#hasConsent = args.hasConsent;
    this.#askEveryPhoto = args.askEveryPhoto;
    this.#permit = args.permit;
    this.#host = args.host ?? '';
  }

  async recognize(photoBytes: Uint8Array): Promise<RecognitionResult> {
    let allowed = false;
    try {
      const perPhoto = this.#askEveryPhoto?.() ?? false;
      allowed = perPhoto
        ? ((await this.#permit?.consume({ host: this.#host, bytes: photoBytes })) ?? false)
        : this.#hasConsent();
    } catch {
      allowed = false;
    }
    if (!allowed) {
      return recognitionFailure('consentRequired', strings().ai.failure.consentRequired);
    }
    return this.#inner.recognize(photoBytes);
  }
}
