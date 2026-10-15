/**
 * The photo flow's logic, free of React: capture -> (consent check) -> `AiRung.recognize` ->
 * resolving state -> match sheet (port of the state machine in the earlier client).
 *
 * Privacy (N1 / N10): the photo bytes live in a local variable of `runPhotoFlow` only. They are
 * never put in a state, a store or a module variable; there is no "last photo". The one-shot
 * permit holds a SHA-256 digest, not the photo, and is revoked in a `finally` so an unspent permit
 * cannot outlive its photo.
 *
 * Consent (the UI asks, this module orders the steps):
 *  - no upload host (the No-AI rung, or nothing would be sent) -> no ask;
 *  - "ask before every photo" (the default, and the fail-closed reading when the setting cannot be
 *    read) -> EVERY photo asks and a yes is a one-shot permit for this photo only;
 *  - otherwise the per-host agreement applies and is asked once; a yes that cannot be saved means
 *    the photo is NOT sent;
 *  - "Not now" drops the photo: the rung is never called and the no-AI core (closest matches and
 *    manual entry) takes over.
 *
 * Nothing here throws: every adapter failure lands on a calm state.
 */
import {
  recognitionFailure,
  recognizedPlate,
  type AiRung,
  type FoodCatalog,
  type FoodMatch,
  type RecognitionResult,
} from '@anc/core';
import { closestMatches } from './closest-matches';
import type { PhotoUploadPermit } from '../ai/photo-upload-permit';
import type { PhotoCapture } from './photo-capture';

/** What the screen renders. `denied` = cancelled, denied or unreadable (one calm path). */
export type PhotoFlowState =
  | { readonly kind: 'capturing' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'resolving' }
  | {
      readonly kind: 'ready';
      readonly result: RecognitionResult;
      readonly closestMatches: readonly FoodMatch[];
    };

export interface PhotoFlowDeps {
  readonly capture: PhotoCapture;
  /** Read at call time so a rung change takes effect on the next photo. May throw. */
  readonly getRung: () => AiRung;
  /** The host the photo would be sent to, or `null` when nothing would leave the device. May throw. */
  readonly uploadHost: () => string | null;
  /** "Ask before every photo upload". May throw (read as `true`). */
  readonly askBeforeEveryPhoto: () => boolean;
  readonly hasHostConsent: (host: string) => boolean;
  /** Show the consent dialog; resolve `true` for a yes. */
  readonly askConsent: (input: { host: string; perPhoto: boolean }) => Promise<boolean>;
  /** Remember the per-host agreement. Rejects when it cannot be saved. */
  readonly grantHostConsent: (host: string) => Promise<void>;
  readonly permit: PhotoUploadPermit;
  readonly catalog: FoodCatalog;
  /** Foods logged in the last week, newest first, as low-confidence matches. */
  readonly recentMatches?: () => Promise<readonly FoodMatch[]>;
  /** Called on every transition. */
  readonly onState: (state: PhotoFlowState) => void;
  /** Stop publishing once the screen is gone or a newer capture replaced this one. */
  readonly isCancelled?: () => boolean;
  /**
   * A newer capture owns the (shared) permit now: this run must not revoke it. Without this, a
   * retake while the first photo is still being recognised would have its permit revoked by the
   * first run finishing, and the second photo would silently not be sent.
   */
  readonly isSuperseded?: () => boolean;
}

/** Runs one capture. Resolves with the final state (also published through `onState`). */
export async function runPhotoFlow(deps: PhotoFlowDeps): Promise<PhotoFlowState> {
  const cancelled = (): boolean => deps.isCancelled?.() === true;
  const publish = (state: PhotoFlowState): PhotoFlowState => {
    if (!cancelled()) deps.onState(state);
    return state;
  };

  publish({ kind: 'capturing' });

  let bytes: Uint8Array | null;
  try {
    bytes = await deps.capture.capture();
  } catch {
    // Defensive: a misfiring picker lands on the calm denied path, never a crash.
    bytes = null;
  }
  if (bytes === null) return publish({ kind: 'denied' });
  if (cancelled()) return { kind: 'denied' };

  let consented = true;
  let host: string | null = null;
  try {
    host = deps.uploadHost();
  } catch {
    // Could not tell where this photo would go: fail closed. It goes nowhere.
    consented = false;
  }

  if (host !== null) {
    let perPhoto: boolean;
    try {
      perPhoto = deps.askBeforeEveryPhoto();
    } catch {
      perPhoto = true;
    }
    try {
      if (perPhoto) {
        consented = await deps.askConsent({ host, perPhoto: true });
        if (consented) await deps.permit.grant({ host, bytes });
      } else if (!deps.hasHostConsent(host)) {
        consented = await deps.askConsent({ host, perPhoto: false });
        if (consented) {
          try {
            await deps.grantHostConsent(host);
          } catch {
            // Could not remember it. Fail closed: the rung's consent guard reads the persisted
            // setting, so this photo is NOT sent and they are asked again next time.
            consented = false;
          }
        }
      }
    } catch {
      consented = false;
    }
  }
  if (cancelled()) {
    if (deps.isSuperseded?.() !== true) deps.permit.revoke();
    return { kind: 'denied' };
  }

  publish({ kind: 'resolving' });

  let recognition: RecognitionResult;
  try {
    // The rung is read INSIDE the try: a missing override or a throwing adapter lands on the calm
    // failure line, never on an endless resolving state. A "not now" never reaches the rung.
    recognition = consented ? await deps.getRung().recognize(bytes) : recognizedPlate([]);
  } catch {
    recognition = recognitionFailure('unknown');
  } finally {
    // An unspent one-shot permit must not outlive this photo.
    if (deps.isSuperseded?.() !== true) deps.permit.revoke();
  }
  if (cancelled()) return { kind: 'denied' };

  const closest = await closestMatches(recognition, deps.catalog, deps.recentMatches);
  return publish({ kind: 'ready', result: recognition, closestMatches: closest });
}
