/**
 * The OpenAI-compatible BYOK provider. POSTs the photo to `<endpoint>/chat/completions` as a
 * vision user message, parses the reply and maps it to a `ByokOutcome`.
 *
 * What leaves the device is pinned (and tested): the body is exactly
 * `{model, messages, max_tokens, temperature}` with one user message of two parts (the fixed
 * prompt, the image data URL), and the headers are only `Authorization` and `Content-Type`. The
 * key is sent in the `Authorization: Bearer` header ONLY: never in a URL, a body, a log or an
 * error, and `toString` is redacted. Nothing about the person is added (no date, id, locale,
 * name, history). A new field has to be argued in the diff and in docs/ai-tiers.md.
 */
import { parseFoodGroup, type EpochMs, type FoodGroup, type RecognizedFood } from '@anc/core';
import { strings, fill } from '../i18n';
import { validateByokEndpoint, type ByokEndpointProblem } from './byok-endpoint';
import {
  PING_RECEIVE_TIMEOUT_MS,
  RECEIVE_TIMEOUT_MS,
  cappedFetch,
  parseJsonBody,
  type FetchLike,
} from '../net/capped-fetch';
import { parseRateLimitReset } from './rate-limit-reset';
import type { ByokOutcome, ByokProvider, ClassifyFoodGroup, PhotoSanitizer } from './types';

/** The status reported for a redirect (never followed): the browser hides the real one. */
const REDIRECT_STATUS = 302;

/** The request produced no usable reply. Internal: mapped to a calm `ByokOutcome` below. */
class ResponseTooLargeError extends Error {}
class RequestTimeoutError extends Error {}
class RequestFailedError extends Error {}

interface PostResult {
  readonly status: number;
  readonly headers: Headers;
  /** The parsed body of a 2xx reply; `undefined` for other statuses or an unparsable body. */
  readonly json: unknown;
}

/** At most this many foods are kept from one model response. */
export const MAX_RECOGNIZED_FOODS = 20;
/** Longest food name / quantity hint kept (characters). */
export const MAX_FOOD_TEXT_LENGTH = 100;
export const RECOGNITION_MAX_TOKENS = 800;
export const RECOGNITION_TEMPERATURE = 0.2;

/** The fixed instruction every photo request carries. */
export const RECOGNITION_PROMPT =
  'Look at the plate in the photo. Return a JSON array of the foods you see. For each food, ' +
  'return an object with three string fields: `name` (the food name, plain English), ' +
  '`quantityHint` (an honest quantity range the user could commit to, e.g. "1 piece", ' +
  '"about 2 fists", "~1 cup") and `group` (the food group, EXACTLY one of: `vegFruit`, ' +
  '`protein`, `starch`, `dairy`, `other` — `other` for oils, sweets, drinks and mixed dishes ' +
  'that fit none of the four). Return an empty array `[]` if the plate is empty or the photo ' +
  'is unreadable. Return ONLY the JSON array — no prose, no markdown fences, no commentary.';

/** The result of "Test connection". Calm, typed, and free of any key material. */
export type ByokConnectionResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'keyRejected' }
  | { readonly kind: 'rateLimited'; readonly resetAt?: EpochMs }
  | { readonly kind: 'endpointInvalid'; readonly problem: ByokEndpointProblem }
  /** The saved key was entered for another host than the endpoint being tested. */
  | { readonly kind: 'keyForOtherHost' }
  /** The response was larger than the 2 MiB cap and was aborted. */
  | { readonly kind: 'responseTooLarge' }
  /** No endpoint, model or key to test with yet. */
  | { readonly kind: 'notConfigured' }
  | { readonly kind: 'unreachable'; readonly reason: 'timeout' | 'network' }
  /** The endpoint answered, but not with success (404 model or path, 4xx, 5xx, 3xx). */
  | { readonly kind: 'unexpectedStatus'; readonly statusCode: number };

/** The "Test connection" port, separate from recognition so fakes stay small. */
export interface ByokConnectionTester {
  testConnection(args: { apiKey: string }): Promise<ByokConnectionResult>;
}

export interface OpenAiCompatibleProviderOptions {
  readonly endpointUrl: string;
  readonly model: string;
  readonly sanitizePhoto: PhotoSanitizer;
  readonly classifyFoodGroup: ClassifyFoodGroup;
  /** Defaults to the global `fetch` (resolved at call time). */
  readonly fetch?: FetchLike | undefined;
  readonly receiveTimeoutMs?: number;
  readonly pingReceiveTimeoutMs?: number;
  readonly bodyReadTimeoutMs?: number;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Control characters become spaces, whitespace runs collapse, the result is capped. */
function cleanText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '') return null;
  const points = Array.from(cleaned);
  return points.length <= MAX_FOOD_TEXT_LENGTH
    ? cleaned
    : points.slice(0, MAX_FOOD_TEXT_LENGTH).join('').trim();
}

function extractText(data: Record<string, unknown>): string | null {
  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first: unknown = choices[0];
  if (typeof first !== 'object' || first === null) return null;
  const choice = first as Record<string, unknown>;
  const message = choice.message;
  if (typeof message === 'object' && message !== null) {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === 'string') return content;
  }
  return typeof choice.text === 'string' ? choice.text : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export class OpenAiCompatibleByokProvider implements ByokProvider, ByokConnectionTester {
  readonly #opts: OpenAiCompatibleProviderOptions;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.#opts = options;
  }

  #fetch(): FetchLike {
    return this.#opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  /**
   * One JSON POST through the shared capped fetch (2 MiB cap, bounded waits, no redirects, no
   * cookies / referrer / cache). The idle timeout is the receive timeout: a stalled stream ends.
   */
  async #post(
    url: string,
    body: unknown,
    apiKey: string,
    receiveTimeoutMs: number | undefined,
  ): Promise<PostResult> {
    const receiveMs = receiveTimeoutMs ?? RECEIVE_TIMEOUT_MS;
    const r = await cappedFetch(url, {
      method: 'POST',
      // Exactly these two headers. The browser adds its own User-Agent and Origin.
      headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      headersTimeoutMs: receiveMs,
      idleTimeoutMs: receiveMs,
      ...(this.#opts.bodyReadTimeoutMs === undefined
        ? {}
        : { bodyTimeoutMs: this.#opts.bodyReadTimeoutMs }),
      fetchImpl: this.#fetch(),
    });
    if (r.kind === 'failure') {
      switch (r.reason) {
        case 'redirect':
          return { status: REDIRECT_STATUS, headers: new Headers(), json: undefined };
        case 'tooLarge':
          throw new ResponseTooLargeError();
        case 'timeout':
          throw new RequestTimeoutError();
        case 'network':
          throw new RequestFailedError();
      }
    }
    return {
      status: r.status,
      headers: r.headers,
      json: r.body.byteLength === 0 ? undefined : parseJsonBody(r.body),
    };
  }

  async recognize(args: { photoBytes: Uint8Array; apiKey: string }): Promise<ByokOutcome> {
    const t = strings().ai.failure;
    const { endpointUrl, model } = this.#opts;
    if (endpointUrl.trim() === '' || model.trim() === '') {
      return failure('notConfigured', t.endpointNotSet);
    }
    const endpoint = validateByokEndpoint(endpointUrl);
    if (endpoint.kind !== 'valid') return failure('notConfigured', t.endpointInvalid);

    // Nothing leaves the device unless it is a photo whose metadata we could remove, labelled
    // with its real type.
    let photo;
    try {
      photo = await this.#opts.sanitizePhoto(args.photoBytes);
    } catch {
      return failure('photoNotSendable', t.photoNotSendable);
    }
    if (photo.kind !== 'sanitized') return failure('photoNotSendable', t.photoNotSendable);

    const body = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: RECOGNITION_PROMPT },
            {
              type: 'image_url',
              image_url: { url: `data:${photo.mime};base64,${base64(photo.bytes)}` },
            },
          ],
        },
      ],
      max_tokens: RECOGNITION_MAX_TOKENS,
      temperature: RECOGNITION_TEMPERATURE,
    };

    try {
      const reply = await this.#post(
        endpoint.chatCompletions,
        body,
        args.apiKey,
        this.#opts.receiveTimeoutMs,
      );
      const { status } = reply;
      if (status === 401 || status === 403) return { kind: 'keyRejected' };
      if (status === 429) {
        const resetAt = resetAtOf(reply.headers);
        return resetAt === undefined
          ? { kind: 'quotaExhausted' }
          : { kind: 'quotaExhausted', resetAt };
      }
      if (status < 200 || status >= 300) {
        return failure('httpError', fill(t.httpStatus, { status, host: endpoint.host }));
      }
      if (!isRecord(reply.json)) return { kind: 'noMatch' };
      const text = extractText(reply.json);
      if (text === null || text === '') return { kind: 'noMatch' };
      return this.#parseFoods(text);
    } catch (e) {
      if (e instanceof ResponseTooLargeError)
        return failure('responseTooLarge', t.responseTooLarge);
      if (e instanceof RequestTimeoutError) {
        return failure('timeout', fill(t.timedOut, { host: endpoint.host }));
      }
      if (e instanceof RequestFailedError) {
        return failure(
          'network',
          `${fill(t.couldNotConnect, { host: endpoint.host })} ${t.blockedByBrowser}`,
        );
      }
      return failure('network', t.unreachable);
    }
  }

  async testConnection(args: { apiKey: string }): Promise<ByokConnectionResult> {
    const { endpointUrl, model } = this.#opts;
    const endpoint = validateByokEndpoint(endpointUrl);
    if (endpoint.kind === 'invalid') {
      return endpointUrl.trim() === ''
        ? { kind: 'notConfigured' }
        : { kind: 'endpointInvalid', problem: endpoint.problem };
    }
    if (model.trim() === '' || args.apiKey.trim() === '') return { kind: 'notConfigured' };
    try {
      // The smallest request that proves endpoint + key + model: one token.
      const reply = await this.#post(
        endpoint.chatCompletions,
        {
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0,
        },
        args.apiKey,
        this.#opts.pingReceiveTimeoutMs ?? PING_RECEIVE_TIMEOUT_MS,
      );
      const { status } = reply;
      if (status >= 200 && status < 300) return { kind: 'ok' };
      if (status === 401 || status === 403) return { kind: 'keyRejected' };
      if (status === 429) {
        const resetAt = resetAtOf(reply.headers);
        return resetAt === undefined ? { kind: 'rateLimited' } : { kind: 'rateLimited', resetAt };
      }
      return { kind: 'unexpectedStatus', statusCode: status };
    } catch (e) {
      if (e instanceof ResponseTooLargeError) return { kind: 'responseTooLarge' };
      if (e instanceof RequestTimeoutError) return { kind: 'unreachable', reason: 'timeout' };
      return { kind: 'unreachable', reason: 'network' };
    }
  }

  /**
   * Parses the model's text as a JSON array of `{name, quantityHint, group}`. `group` is
   * validated against the closed enum; a missing or unknown value falls back to the classifier
   * on the cleaned name, never to a guess. The output is untrusted: at most 20 entries are kept
   * and every string is cleaned and capped at 100 characters.
   */
  #parseFoods(text: string): ByokOutcome {
    const jsonText = text
      .trim()
      // Strip a leading/trailing markdown fence if the model added one despite the prompt.
      .replace(/^```(?:json)?\s*|\s*```$/gm, '')
      .trim();
    let decoded: unknown;
    try {
      decoded = JSON.parse(jsonText);
    } catch {
      // Some models wrap the array in prose: try the outer `[` ... `]` slice as a last resort.
      const start = jsonText.indexOf('[');
      const end = jsonText.lastIndexOf(']');
      if (start < 0 || end <= start) return { kind: 'noMatch' };
      try {
        decoded = JSON.parse(jsonText.slice(start, end + 1));
      } catch {
        return { kind: 'noMatch' };
      }
    }
    if (!Array.isArray(decoded) || decoded.length === 0) return { kind: 'noMatch' };
    const foods: RecognizedFood[] = [];
    for (const entry of decoded as unknown[]) {
      if (foods.length >= MAX_RECOGNIZED_FOODS) break;
      if (!isRecord(entry)) continue;
      const name = cleanText(entry.name);
      const hint = cleanText(entry.quantityHint);
      if (name === null) continue;
      const group: FoodGroup = parseFoodGroup(entry.group) ?? this.#opts.classifyFoodGroup(name);
      foods.push({
        databaseFood: {
          sourceRef: `byok-${this.#opts.model}-${name}`,
          displayName: name,
          source: 'manual',
          foodGroup: group,
        },
        confidence: 0.5,
        quantity: {
          low: 1,
          high: 1,
          unit: hint ?? 'serving',
          displayLabel: hint ?? '1 serving',
        },
      });
    }
    return foods.length === 0 ? { kind: 'noMatch' } : { kind: 'recognized', foods };
  }

  /** Redacted: never the endpoint, the model or the key. */
  toString(): string {
    return 'OpenAiCompatibleByokProvider(endpointUrl: redacted, model: redacted)';
  }
}

function resetAtOf(headers: Headers): EpochMs | undefined {
  return (
    parseRateLimitReset(headers.get('retry-after')) ??
    parseRateLimitReset(headers.get('x-ratelimit-reset'))
  );
}

function failure(
  cause: Extract<ByokOutcome, { kind: 'failure' }>['cause'],
  message: string,
): ByokOutcome {
  return { kind: 'failure', cause, message };
}
