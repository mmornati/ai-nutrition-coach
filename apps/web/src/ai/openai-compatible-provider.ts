/**
 * The OpenAI-compatible BYOK provider. POSTs the photo to `<endpoint>/chat/completions` as a
 * vision user message, parses the reply and maps it to a `ByokOutcome`.
 *
 * What leaves the device is pinned (and tested): the body is exactly
 * `{model, messages, max_tokens, temperature}` with one user message of two parts (the fixed
 * prompt, the image data URL), and the headers are only `Authorization` and `Content-Type`. The
 * key is sent in the `Authorization: Bearer` header ONLY: never in a URL, a body, a log or an
 * error, and `toString` is redacted. Nothing about the person is added (no date, id, name,
 * history). The one thing that follows the person is the language: the fixed prompt is one of two
 * templates (English, French) that asks for the food names in that language; no free text goes in.
 * A new field has to be argued in the diff and in docs/ai-tiers.md.
 */
import type { EpochMs } from '@anc/core';
import { currentLocale, strings, fill } from '../i18n';
import type { Locale } from '../i18n/locale';
import { validateByokEndpoint, type ByokEndpointProblem } from './byok-endpoint';
import {
  PING_RECEIVE_TIMEOUT_MS,
  RECEIVE_TIMEOUT_MS,
  cappedFetch,
  parseJsonBody,
  type FetchLike,
} from '../net/capped-fetch';
import { parseRateLimitReset } from './rate-limit-reset';
import { parseRecognizedFoods } from './recognition-parse';
import type {
  ByokOutcome,
  ByokProvider,
  ChatMessage,
  ChatOutcome,
  ClassifyFoodGroup,
  PhotoSanitizer,
} from './types';

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

export { MAX_FOOD_TEXT_LENGTH, MAX_RECOGNIZED_FOODS } from './recognition-parse';
export const RECOGNITION_MAX_TOKENS = 1600;
export const RECOGNITION_TEMPERATURE = 0.2;

/**
 * The fixed instruction every photo request carries: one template per language, never built from
 * anything the person typed. The `name` is asked for in the person's language and so is the
 * quantity hint; the `group` identifiers are the closed English enum in both, because the reply is
 * validated against it.
 */
export const RECOGNITION_PROMPTS: Readonly<Record<Locale, string>> = {
  en:
    'Look at the plate in the photo. Return a JSON array of the foods you see. For each food, ' +
    'return an object with these fields: `name` (the food name, plain English), ' +
    '`quantityHint` (an honest quantity range the user could commit to, e.g. "1 piece", ' +
    '"about 2 fists", "~1 cup"), `grams` (your best estimate of the weight of this food on the ' +
    "plate, in grams, as a number), `per100g` (an object with your estimate of this food's " +
    'nutrients per 100 g, numbers only: `energyKcal` in kcal, then `protein`, `carbohydrate`, ' +
    '`sugars`, `fat`, `saturatedFat`, `fibre` and `salt` in grams; leave out any you do not ' +
    'know), `group` (the food group, EXACTLY one of: `vegFruit`, ' +
    '`protein`, `starch`, `dairy`, `other` — `other` for oils, sweets, drinks and mixed dishes ' +
    'that fit none of the four) and `confidence` (a number from 0 to 1: how sure you are ' +
    'of this food, 1 being certain). Return an empty array `[]` if the plate is empty or the photo ' +
    'is unreadable. Return ONLY the JSON array — no prose, no markdown fences, no commentary.',
  fr:
    'Regardez l’assiette sur la photo. Renvoyez un tableau JSON des aliments que vous voyez. Pour ' +
    'chaque aliment, renvoyez un objet avec ces champs : `name` (le nom de l’aliment, ' +
    'en français courant), `quantityHint` (une estimation honnête de la quantité, en ' +
    'français, que la personne peut confirmer, par ' +
    'ex. « 1 pièce », « environ 2 poings », « ~1 tasse »), `grams` (votre meilleure estimation du ' +
    'poids de cet aliment dans l’assiette, en grammes, sous forme de nombre), `per100g` (un objet ' +
    'avec votre estimation des nutriments pour 100 g de cet aliment, nombres uniquement : ' +
    '`energyKcal` en kcal, puis `protein`, `carbohydrate`, `sugars`, `fat`, `saturatedFat`, ' +
    '`fibre` et `salt` en grammes ; omettez ceux que vous ne connaissez pas), `group` (le groupe alimentaire, ' +
    'EXACTEMENT l’un de : `vegFruit`, `protein`, `starch`, `dairy`, `other` — ces ' +
    'identifiants restent en anglais ; `other` pour les huiles, les sucreries, les boissons et ' +
    'les plats composés qui n’entrent dans aucun des quatre) et `confidence` (un nombre de 0 à 1 : votre degré de ' +
    'certitude sur cet aliment, 1 étant certain). Renvoyez un tableau vide `[]` si ' +
    'l’assiette est vide ou la photo illisible. Renvoyez UNIQUEMENT le tableau JSON — pas de ' +
    'prose, pas de bloc de code markdown, pas de commentaire.',
};

/** The English template (the default, and the one the request tests pin). */
export const RECOGNITION_PROMPT = RECOGNITION_PROMPTS.en;

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
  /** Aborts an in-flight request (the session ended). */
  readonly signal?: AbortSignal | undefined;
  /** The language to ask the answer in, read when the request is built. Default: the app's. */
  readonly locale?: (() => Locale) | undefined;
  /**
   * `false` for the instance proxy: the request carries NO Authorization header (the server adds
   * the key; the browser never holds it). Default `true` (BYOK).
   */
  readonly sendKey?: boolean | undefined;
  /**
   * `true`: a chat message marked as a cache breakpoint goes out as one text part with
   * `cache_control: {type: "ephemeral"}` (OpenRouter forwards it to Anthropic and Gemini models).
   * Off by default: a strict OpenAI-compatible server may refuse a field it does not know.
   */
  readonly cacheMarkers?: boolean | undefined;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
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
    signal?: AbortSignal,
  ): Promise<PostResult> {
    const receiveMs = receiveTimeoutMs ?? RECEIVE_TIMEOUT_MS;
    const outer =
      signal === undefined ? this.#opts.signal : combineSignals(this.#opts.signal, signal);
    const r = await cappedFetch(url, {
      method: 'POST',
      // Exactly these two headers (only Content-Type for the instance proxy, whose server holds
      // the key). The browser adds its own User-Agent and Origin.
      headers:
        this.#opts.sendKey === false
          ? { 'Content-Type': 'application/json' }
          : { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      headersTimeoutMs: receiveMs,
      idleTimeoutMs: receiveMs,
      ...(this.#opts.bodyReadTimeoutMs === undefined
        ? {}
        : { bodyTimeoutMs: this.#opts.bodyReadTimeoutMs }),
      fetchImpl: this.#fetch(),
      ...(outer ? { signal: outer } : {}),
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
            { type: 'text', text: RECOGNITION_PROMPTS[(this.#opts.locale ?? currentLocale)()] },
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
        return failure('httpError', fill(t.httpStatus, { status, host: endpoint.host }), status);
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
    if (model.trim() === '' || (this.#opts.sendKey !== false && args.apiKey.trim() === '')) {
      return { kind: 'notConfigured' };
    }
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
   * One plain-text chat completion through the same transport (same endpoint, same headers, same
   * caps and timeouts): the seam a later LLM coach reuses. Nothing here is added to the messages:
   * the caller decides every word that leaves the device. For the instance proxy `apiKey` is
   * ignored (no Authorization header is sent). Never throws.
   */
  async completeChat(args: {
    readonly messages: readonly ChatMessage[];
    readonly apiKey?: string;
    readonly maxTokens?: number;
    readonly temperature?: number;
    readonly signal?: AbortSignal;
  }): Promise<ChatOutcome> {
    const t = strings().ai.failure;
    const { endpointUrl, model } = this.#opts;
    if (endpointUrl.trim() === '' || model.trim() === '') {
      return { kind: 'failure', cause: 'notConfigured', message: t.endpointNotSet };
    }
    const endpoint = validateByokEndpoint(endpointUrl);
    if (endpoint.kind !== 'valid') {
      return { kind: 'failure', cause: 'notConfigured', message: t.endpointInvalid };
    }
    try {
      const reply = await this.#post(
        endpoint.chatCompletions,
        {
          model,
          messages: args.messages.map((m) => this.#wireMessage(m)),
          max_tokens: args.maxTokens ?? RECOGNITION_MAX_TOKENS,
          temperature: args.temperature ?? RECOGNITION_TEMPERATURE,
        },
        args.apiKey ?? '',
        this.#opts.receiveTimeoutMs,
        args.signal,
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
        return {
          kind: 'failure',
          cause: 'httpError',
          message: fill(t.httpStatus, { status, host: endpoint.host }),
          status,
        };
      }
      const text = isRecord(reply.json) ? extractText(reply.json) : null;
      if (text === null || text === '') {
        return { kind: 'failure', cause: 'invalidResponse', message: t.unreachable };
      }
      return { kind: 'text', text };
    } catch (e) {
      if (e instanceof ResponseTooLargeError) {
        return { kind: 'failure', cause: 'responseTooLarge', message: t.responseTooLarge };
      }
      if (e instanceof RequestTimeoutError) {
        return {
          kind: 'failure',
          cause: 'timeout',
          message: fill(t.timedOut, { host: endpoint.host }),
        };
      }
      return { kind: 'failure', cause: 'network', message: t.unreachable };
    }
  }

  /** A chat message as sent: plain text, or one marked text part when cache markers are on. */
  #wireMessage(m: ChatMessage): unknown {
    if (this.#opts.cacheMarkers !== true || m.cacheBreakpoint !== true) {
      return { role: m.role, content: m.content };
    }
    return {
      role: m.role,
      content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }],
    };
  }

  /** The model's text as recognised foods (see `parseRecognizedFoods`). */
  #parseFoods(text: string): ByokOutcome {
    return parseRecognizedFoods(text, {
      classifyFoodGroup: this.#opts.classifyFoodGroup,
      sourceRefPrefix: `byok-${this.#opts.model}-`,
    });
  }

  /** Redacted: never the endpoint, the model or the key. */
  toString(): string {
    return 'OpenAiCompatibleByokProvider(endpointUrl: redacted, model: redacted)';
  }
}

/** An outer cancel (the session ended) plus a per-call one (the caller gave up). */
function combineSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (a === undefined) return b;
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (a.aborted || b.aborted) controller.abort();
  a.addEventListener('abort', abort, { once: true });
  b.addEventListener('abort', abort, { once: true });
  return controller.signal;
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
  status?: number,
): ByokOutcome {
  return status === undefined
    ? { kind: 'failure', cause, message }
    : { kind: 'failure', cause, message, status };
}
