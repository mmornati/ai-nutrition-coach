/**
 * Private network helper for the AI client: one JSON POST with the product's hygiene rules.
 * (Phase 5 builds a general capped fetch in `src/net`; the two can converge later.)
 *
 * - header timeout (the browser exposes no separate connect/send phases: the time until the
 *   response headers arrive is bounded by the receive timeout), a per-chunk idle timeout of the
 *   same length and an overall body-read budget of 60 s;
 * - the response is streamed and aborted past 2 MiB (an over-long `Content-Length` is refused up
 *   front), never buffered unbounded;
 * - redirects are never followed: a 3xx is a failure (a `Location` would carry the key and the
 *   photo to a server nobody chose);
 * - no cookies, no referrer, no HTTP cache.
 */
import type { FetchLike } from './types';

export const CONNECT_TIMEOUT_MS = 10_000;
export const SEND_TIMEOUT_MS = 30_000;
export const RECEIVE_TIMEOUT_MS = 45_000;
export const PING_RECEIVE_TIMEOUT_MS = 20_000;
export const BODY_READ_TIMEOUT_MS = 60_000;
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** The status reported for a redirect the browser refused to expose (`opaqueredirect`). */
export const REDIRECT_STATUS = 302;

export class ResponseTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`response larger than ${maxBytes} bytes`);
    this.name = 'ResponseTooLargeError';
  }
}

export class RequestTimeoutError extends Error {
  constructor() {
    super('request timed out');
    this.name = 'RequestTimeoutError';
  }
}

/** The request never produced a response: offline, DNS, TLS, or blocked by CORS or CSP. */
export class RequestFailedError extends Error {
  constructor() {
    super('request failed');
    this.name = 'RequestFailedError';
  }
}

export interface PostResult {
  readonly status: number;
  readonly headers: Headers;
  /** The parsed body of a 2xx reply; `undefined` for other statuses or an unparsable body. */
  readonly json: unknown;
}

export interface PostOptions {
  readonly fetch: FetchLike;
  readonly receiveTimeoutMs?: number | undefined;
  readonly bodyReadTimeoutMs?: number | undefined;
  readonly maxBytes?: number | undefined;
}

function timeoutAfter(ms: number): { promise: Promise<never>; cancel: () => void } {
  let id: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    id = setTimeout(() => reject(new RequestTimeoutError()), ms);
  });
  // The race may settle first; never leave an unhandled rejection behind.
  promise.catch(() => undefined);
  return { promise, cancel: () => clearTimeout(id) };
}

async function within<T>(work: Promise<T>, ms: number): Promise<T> {
  const t = timeoutAfter(ms);
  try {
    return await Promise.race([work, t.promise]);
  } finally {
    t.cancel();
  }
}

/** POSTs `body` as JSON. Only `headers` are sent (the caller passes exactly two). */
export async function postJson(
  url: string,
  body: unknown,
  headers: Readonly<Record<string, string>>,
  options: PostOptions,
): Promise<PostResult> {
  const receiveMs = options.receiveTimeoutMs ?? RECEIVE_TIMEOUT_MS;
  const budgetMs = options.bodyReadTimeoutMs ?? BODY_READ_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;
  const controller = new AbortController();

  let response: Response;
  try {
    response = await within(
      options.fetch(url, {
        method: 'POST',
        headers: { ...headers },
        body: JSON.stringify(body),
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      }),
      receiveMs,
    );
  } catch (e) {
    controller.abort();
    if (e instanceof RequestTimeoutError) throw e;
    throw new RequestFailedError();
  }

  const status = response.type === 'opaqueredirect' ? REDIRECT_STATUS : response.status;
  const discard = (): void => {
    controller.abort();
    void response.body?.cancel().catch(() => undefined);
  };
  if (status < 200 || status >= 300) {
    // Error bodies are never read.
    discard();
    return { status, headers: response.headers, json: undefined };
  }

  const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    discard();
    throw new ResponseTooLargeError(maxBytes);
  }

  const reader = response.body?.getReader();
  if (reader === undefined) return { status, headers: response.headers, json: undefined };
  const chunks: Uint8Array[] = [];
  let total = 0;
  const deadline = timeoutAfter(budgetMs);
  try {
    for (;;) {
      const next = await within(Promise.race([reader.read(), deadline.promise]), receiveMs);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        throw new ResponseTooLargeError(maxBytes);
      }
      chunks.push(next.value);
    }
  } catch (e) {
    controller.abort();
    void reader.cancel().catch(() => undefined);
    if (e instanceof ResponseTooLargeError || e instanceof RequestTimeoutError) throw e;
    throw new RequestFailedError();
  } finally {
    deadline.cancel();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    json = undefined;
  }
  return { status, headers: response.headers, json };
}
