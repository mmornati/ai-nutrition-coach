// Test support for the AI module: a scriptable fetch, a stub sanitiser (Phase 5's result shape), digest and classifier.
import { reviewKindOf, type FoodGroup, type RecognizedFood } from '@anc/core';
import type { KeyValueStore } from '../storage/key-value-store';
import type { FetchLike } from '../net/capped-fetch';
import type { PhotoDigest, PhotoSanitizer, ClassifyFoodGroup } from './types';

/** Long enough to show a hint; shaped like a real key so leaks are easy to grep for. */
export const TEST_KEY = 'sk-or-v1-supersecretkey1234567890abcd';

export const chatReply = (content: string): unknown => ({
  choices: [{ message: { role: 'assistant', content } }],
});

export interface RecordedRequest {
  readonly url: string;
  readonly init: RequestInit;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** A scriptable `fetch`. Every request is recorded; nothing touches the network. */
export class FakeFetch {
  requests: RecordedRequest[] = [];
  /**
   * The second-pass review requests (the AI's check of a question or of a coach text). They are kept
   * out of `requests`, which stays the coach calls a test asserts on, and answered with
   * `reviewReplies` (by default "an ordinary question" and "ok") under the same status, error and
   * hang settings as every other request.
   */
  reviewRequests: RecordedRequest[] = [];
  reviewReplies: { ask: unknown; output: unknown } = {
    ask: chatReply('{"route":"none"}'),
    output: chatReply('{"verdict":"ok","reason":"other"}'),
  };
  status = 200;
  headers: Record<string, string> = {};
  jsonBody: unknown = {};
  /** Reject like a browser does for a CORS/CSP block or an offline host. */
  error: Error | null = null;
  /** Never answer (until aborted). */
  hang = false;
  /** Stream these chunks as the body instead of `jsonBody`. */
  stream: ReadableStream<Uint8Array> | null = null;
  /** Answer like a browser that refused to follow a redirect. */
  opaqueRedirect = false;
  /**
   * The container's `/ai/config.json` (the instance-wide AI offer). It is answered at once, whatever
   * `hang` and `error` say, and kept out of `requests` (those are the AI and catalogue calls a test
   * asserts on); look in `configRequests`. Default: the server offers no AI.
   */
  instanceConfig: unknown = { enabled: false };
  configStatus = 200;
  /** Answer the config read like a browser that met a sign-in redirect (opaque, status 0). */
  configOpaqueRedirect = false;
  configRequests: RecordedRequest[] = [];

  get last(): RecordedRequest {
    const r = this.requests.at(-1);
    if (r === undefined) throw new Error('no request was made');
    return r;
  }

  fetch: FetchLike = async (url, init = {}) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => {
      headers[k] = v;
    });
    if (url.endsWith('/ai/config.json')) {
      this.configRequests.push({ url, init, body: '', headers });
      if (this.configOpaqueRedirect) {
        const r = new Response(null, { status: 200 });
        Object.defineProperty(r, 'type', { value: 'opaqueredirect' });
        Object.defineProperty(r, 'status', { value: 0 });
        return r;
      }
      return new Response(JSON.stringify(this.instanceConfig), {
        status: this.configStatus,
        headers: { 'content-type': 'application/json' },
      });
    }
    const recorded = { url, init, body: String(init.body ?? ''), headers };
    const review = reviewKindIn(recorded.body);
    (review === null ? this.requests : this.reviewRequests).push(recorded);
    if (this.error) throw this.error;
    if (this.hang) {
      await new Promise<never>((_, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    }
    if (this.opaqueRedirect) {
      const r = new Response(null, { status: 200 });
      Object.defineProperty(r, 'type', { value: 'opaqueredirect' });
      Object.defineProperty(r, 'status', { value: 0 });
      return r;
    }
    const body =
      this.stream ??
      (this.status === 204 || this.status === 304
        ? null
        : JSON.stringify(review === null ? this.jsonBody : this.reviewReplies[review]));
    return new Response(body, {
      status: this.status,
      headers: { 'content-type': 'application/json', ...this.headers },
    });
  };
}

/** Which second-pass review a request body is, or `null` for an ordinary request. */
function reviewKindIn(body: string): 'ask' | 'output' | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const messages = (parsed as { messages?: unknown }).messages;
    return Array.isArray(messages) ? reviewKindOf(messages as { content: unknown }[]) : null;
  } catch {
    return null;
  }
}

/** An endless stream of `chunkSize`-byte chunks that records pulls and cancellation. */
export function endlessStream(chunkSize: number): {
  stream: ReadableStream<Uint8Array>;
  pulls: () => number;
  cancelled: () => boolean;
} {
  let pulls = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(chunkSize));
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, pulls: () => pulls, cancelled: () => cancelled };
}

/** A JPEG-looking photo; the stub sanitiser stands in for Phase 5's real one. */
export const photoBytes = (...tail: number[]): Uint8Array =>
  Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, ...tail]);

/** Accepts JPEG and PNG-looking bytes (labelled with their type), refuses anything else. */
export const stubSanitizer: PhotoSanitizer = (bytes) => {
  if (bytes[0] === 0xff && bytes[1] === 0xd8)
    return { kind: 'sanitized', mime: 'image/jpeg', bytes };
  if (bytes[0] === 0x89 && bytes[1] === 0x50)
    return { kind: 'sanitized', mime: 'image/png', bytes };
  return { kind: 'unsendable', reason: 'unrecognisedFormat' };
};

/** A deterministic stand-in for SHA-256: distinct bytes give distinct digests. */
export const stubDigest: PhotoDigest = (bytes) => Array.from(bytes).join('.');

export const stubClassify: ClassifyFoodGroup = (name): FoodGroup => {
  const n = name.toLowerCase();
  if (n.includes('peanut butter')) return 'protein';
  if (n.includes('rice')) return 'starch';
  return 'other';
};

export function makeFood(name: string, group: FoodGroup = 'vegFruit'): RecognizedFood {
  return {
    databaseFood: {
      sourceRef: `seed:${name}`,
      displayName: name,
      source: 'manual',
      foodGroup: group,
    },
    confidence: 0.85,
    quantity: { low: 1, high: 1, unit: 'piece', displayLabel: '~1 piece' },
  };
}

/** An in-memory `KeyValueStore` that can be told to fail writes (a locked store). */
export class MemoryKv implements KeyValueStore {
  readonly map = new Map<string, string>();
  failWrites = false;
  failReads = false;
  writes = 0;

  async read(key: string): Promise<string | null> {
    if (this.failReads) throw new Error('unreadable');
    return this.map.get(key) ?? null;
  }
  async write(key: string, value: string): Promise<void> {
    if (this.failWrites) throw new Error('locked');
    this.writes += 1;
    this.map.set(key, value);
  }
  async delete(key: string): Promise<void> {
    if (this.failWrites) throw new Error('locked');
    this.map.delete(key);
  }
}
