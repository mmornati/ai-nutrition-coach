import type { FoodGroup, RecognizedFood, RecognitionFailureCause, EpochMs } from '@anc/core';
import type { PhotoSanitizeResult } from '../capture/photo-sanitizer';

/**
 * Strips metadata and detects the real MIME type, or refuses (Phase 5's `sanitizePhotoForUpload`,
 * used directly: `{kind:'sanitized'}` is sent, `{kind:'unsendable'}` never leaves the device).
 * Injected; never throws.
 */
export type PhotoSanitizer = (
  bytes: Uint8Array,
) => PhotoSanitizeResult | Promise<PhotoSanitizeResult>;

/** SHA-256 (hex) of the photo bytes. Binds a one-shot upload permit to exactly one photo. */
export type PhotoDigest = (bytes: Uint8Array) => string | Promise<string>;

/**
 * Maps ONE food name to a group. Used when a model food has no valid group. Injected. Adapt the
 * catalog's descriptor-list classifier with `classifyFoodByName`; the catalog's own
 * `classifyFoodGroup` takes a `readonly string[]` so a bare string cannot be passed to it.
 */
export type ClassifyFoodGroup = (name: string) => FoodGroup;

/** The outcome of one recognition call before the rung maps it onto `RecognitionResult`. */
export type ByokOutcome =
  | { readonly kind: 'recognized'; readonly foods: readonly RecognizedFood[] }
  | { readonly kind: 'noMatch' }
  | {
      readonly kind: 'failure';
      readonly cause: RecognitionFailureCause;
      readonly message: string;
    }
  | { readonly kind: 'keyRejected' }
  | { readonly kind: 'quotaExhausted'; readonly resetAt?: EpochMs };

/** The transport the BYOK rung reads through. The key is passed per call, never held. */
export interface ByokProvider {
  recognize(args: { photoBytes: Uint8Array; apiKey: string }): Promise<ByokOutcome>;
}
