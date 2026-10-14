import type {
  FoodGroup,
  RecognizedFood,
  RecognitionFailureCause,
  EpochMs,
  Result,
} from '@anc/core';

/**
 * The photo as it may leave the device: metadata removed, labelled with its real type.
 * Phase 5 owns the real sanitiser; this module only declares what it needs from it.
 */
export interface SanitizedPhoto {
  readonly mime: string;
  readonly bytes: Uint8Array;
}

/** Why a photo was refused for upload (unrecognised, malformed, metadata that cannot be removed). */
export interface PhotoRefusal {
  readonly kind: string;
}

/** Strips metadata and detects the real MIME type, or refuses. Injected; never throws. */
export type PhotoSanitizer = (
  bytes: Uint8Array,
) => Result<SanitizedPhoto, PhotoRefusal> | Promise<Result<SanitizedPhoto, PhotoRefusal>>;

/** SHA-256 (hex) of the photo bytes. Binds a one-shot upload permit to exactly one photo. */
export type PhotoDigest = (bytes: Uint8Array) => string | Promise<string>;

/** Maps a food name to a group. Used when a model food has no valid group. Injected. */
export type ClassifyFoodGroup = (name: string) => FoodGroup;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

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
