import {
  recognitionFailure,
  recognizedPlate,
  type AiRung,
  type RecognitionResult,
} from '@anc/core';
import type { AiSettings } from './ai-settings';
import type { AiSettingsController } from './ai-settings-controller';
import type { PhotoUploadPermit } from './photo-upload-permit';
import { photoUploadHost } from './rung-registry';

/** What the "Send this photo to {host}?" dialog is asked about. */
export interface PhotoConsentRequest {
  readonly host: string;
  /** `true`: this photo only (nothing remembered). `false`: the host is remembered. */
  readonly perPhoto: boolean;
}

/**
 * Does this photo need a yes first? `null` when nothing would leave the device (No AI) or the
 * person already agreed to the host in the per-host mode. By default EVERY photo asks.
 */
export function photoConsentRequest(settings: AiSettings): PhotoConsentRequest | null {
  const host = photoUploadHost(settings);
  if (host === null) return null;
  if (settings.askBeforeEveryPhoto) return { host, perPhoto: true };
  return settings.hasConsentFor(host) ? null : { host, perPhoto: false };
}

export interface RecognizeWithConsentArgs {
  readonly photoBytes: Uint8Array;
  readonly settings: () => AiSettings;
  readonly controller: Pick<AiSettingsController, 'grantPhotoConsent'>;
  readonly permit: PhotoUploadPermit;
  /** The live rung (consent-gated for BYOK). */
  readonly rung: AiRung;
  /** Shows the dialog; resolves `true` for "Send this photo" / "Allow {host}". */
  readonly ask: (request: PhotoConsentRequest) => Promise<boolean>;
}

export interface RecognizeWithConsentResult {
  readonly result: RecognitionResult;
  /** `true` only when the photo was handed to a rung that may upload. */
  readonly consented: boolean;
}

/**
 * The capture-time consent flow. By default every photo asks and a yes is a one-shot permit for
 * that photo (nothing remembered). With "ask before every photo" off, the per-host agreement
 * applies: a yes is remembered for the host (revocable in Your AI). If anything about the
 * consent cannot be established or saved, the photo is NOT sent and the no-AI core (an empty
 * plate: closest matches and manual entry) takes over. An unspent permit never outlives the
 * photo.
 */
export async function recognizeWithConsent(
  args: RecognizeWithConsentArgs,
): Promise<RecognizeWithConsentResult> {
  let consented = true;
  try {
    const request = photoConsentRequest(args.settings());
    if (request !== null) {
      consented = await args.ask(request);
      if (consented) {
        if (request.perPhoto) {
          await args.permit.grant({ host: request.host, bytes: args.photoBytes });
        } else {
          // Could not remember it: fail closed, the photo is not sent and they are asked again.
          await args.controller.grantPhotoConsent(request.host);
        }
      }
    }
  } catch {
    consented = false;
  }
  try {
    if (!consented) return { result: recognizedPlate([]), consented };
    try {
      return { result: await args.rung.recognize(args.photoBytes), consented };
    } catch {
      // Adapters must wrap failures; a contract violation still lands on the calm failure.
      return { result: recognitionFailure('unknown'), consented };
    }
  } finally {
    args.permit.revoke();
  }
}
