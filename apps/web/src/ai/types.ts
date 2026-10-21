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
      /** The HTTP status, when the failure was an unexpected one (404, 5xx, ...). */
      readonly status?: number;
    }
  | { readonly kind: 'keyRejected' }
  | { readonly kind: 'quotaExhausted'; readonly resetAt?: EpochMs };

/** The transport the BYOK rung reads through. The key is passed per call, never held. */
export interface ByokProvider {
  recognize(args: { photoBytes: Uint8Array; apiKey: string }): Promise<ByokOutcome>;
}

/** One message of a text chat. The caller decides every word; nothing is added on the way out. */
export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/** The outcome of one text completion before a rung maps it onto `ChatResult`. */
export type ChatOutcome =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'quotaExhausted'; readonly resetAt?: EpochMs }
  | { readonly kind: 'keyRejected' }
  | {
      readonly kind: 'failure';
      readonly cause: RecognitionFailureCause;
      readonly message: string;
      readonly status?: number;
    };

/** Options for one `completeChat` call. */
export interface ChatOptions {
  /** Upper bound on the reply (the proxy caps it too). */
  readonly maxTokens?: number;
  readonly temperature?: number;
  /** Cancels this call (a screen went away). The session's own abort still applies. */
  readonly signal?: AbortSignal;
}

/**
 * What a text completion gives back, calm and typed (never thrown):
 *  - `text`: the model's reply;
 *  - `busy`: the server asked to slow down (429): say "busy, try again in a moment", no countdown;
 *  - `unavailable`: this rung offers no text completion right now (the person is on No AI or their
 *    own key, or this server no longer offers AI);
 *  - `failure`: anything else, with a short calm line for the person.
 */
export type ChatResult =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'busy' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failure'; readonly message: string };

/**
 * The text-completion seam over the instance rung. A later LLM coach calls this and nothing
 * else: it needs no key, no endpoint and no model (the server holds all three). It does NOT ask
 * for consent: the caller must, because what it sends is the caller's text.
 */
export interface TextCompletionPort {
  completeChat(messages: readonly ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
}
