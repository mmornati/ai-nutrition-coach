/**
 * Bounded network reads for every client in the app (N3). A hostile or broken endpoint must not be able to make the app buffer
 * an unbounded body or hold a request open forever, and a redirect must never carry a request to
 * a host nobody agreed to.
 *
 *  - the body is streamed and the read is aborted (the request too) the moment 2 MiB is crossed;
 *    an over-long `Content-Length` is refused before reading;
 *  - the wait for response headers is bounded (the browser has no separate connect / send /
 *    receive timeouts, so the earlier 10 s / 30 s / 45 s trio collapses to the longest, 45 s) and so
 *    is the overall body read (60 s: a server dribbling one byte at a time cannot hold it open);
 *  - redirects are never followed (`redirect: 'manual'`); a 3xx is a failure;
 *  - requests carry no cookies and no referrer (`credentials: 'omit'`, `referrerPolicy:
 *    'no-referrer'`), and the caller decides every header: nothing is added here.
 *
 * Nothing here throws across its boundary: every outcome is a typed result.
 */

/** Default ceiling for any response body: 2 MiB. One OFF product or a chat completion is a few KiB. */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** The earlier client's connect / send / receive timeouts. A browser exposes one wait for headers. */
export const CONNECT_TIMEOUT_MS = 10_000;
export const SEND_TIMEOUT_MS = 30_000;
export const RECEIVE_TIMEOUT_MS = 45_000;
/** The "Test connection" ping uses a shorter receive timeout. */
export const PING_RECEIVE_TIMEOUT_MS = 20_000;
/** Overall wall-clock budget for reading one body, after the headers arrived. */
export const BODY_READ_TIMEOUT_MS = 60_000;

export type CappedFailureReason = 'network' | 'timeout' | 'tooLarge' | 'redirect';

export type CappedFetchResult =
  | {
      readonly kind: 'response';
      readonly status: number;
      readonly headers: Headers;
      /** Empty unless the status was one `readBodyWhen` asked for. */
      readonly body: Uint8Array;
    }
  | { readonly kind: 'failure'; readonly reason: CappedFailureReason };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CappedFetchOptions {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
  readonly maxBytes?: number;
  /** Wait for the response headers. Defaults to {@link RECEIVE_TIMEOUT_MS}. */
  readonly headersTimeoutMs?: number;
  /** Overall body-read budget. Defaults to {@link BODY_READ_TIMEOUT_MS}. */
  readonly bodyTimeoutMs?: number;
  /**
   * Longest wait for the NEXT chunk of the body (a stalled stream). Default: none; the overall
   * {@link bodyTimeoutMs} still applies.
   */
  readonly idleTimeoutMs?: number;
  /** Which statuses have their body read (others are cancelled unread). Default: 2xx. */
  readonly readBodyWhen?: (status: number) => boolean;
  /** An outer cancel (e.g. the screen went away). */
  readonly signal?: AbortSignal;
  /** Injectable for tests; defaults to the global `fetch`. */
  readonly fetchImpl?: FetchLike;
}

const is2xx = (status: number): boolean => status >= 200 && status < 300;

const fail = (reason: CappedFailureReason): CappedFetchResult => ({ kind: 'failure', reason });

export async function cappedFetch(
  url: string,
  options: CappedFetchOptions = {},
): Promise<CappedFetchResult> {
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;
  const headersTimeoutMs = options.headersTimeoutMs ?? RECEIVE_TIMEOUT_MS;
  const bodyTimeoutMs = options.bodyTimeoutMs ?? BODY_READ_TIMEOUT_MS;
  const readBodyWhen = options.readBodyWhen ?? is2xx;
  const doFetch: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));

  const controller = new AbortController();
  let timedOut = false;
  const onOuterAbort = (): void => controller.abort();
  if (options.signal) {
    if (options.signal.aborted) return fail('network');
    options.signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, headersTimeoutMs);
  const stopTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  try {
    let response: Response;
    try {
      response = await doFetch(url, {
        method: options.method ?? 'GET',
        ...(options.headers ? { headers: { ...options.headers } } : {}),
        ...(options.body !== undefined ? { body: options.body as BodyInit } : {}),
        redirect: 'manual',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch {
      return fail(timedOut ? 'timeout' : 'network');
    }

    // A manual redirect is an opaque response in browsers (status 0) and a plain 3xx elsewhere.
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      void response.body?.cancel().catch(() => undefined);
      return fail('redirect');
    }

    if (!readBodyWhen(response.status)) {
      void response.body?.cancel().catch(() => undefined);
      return {
        kind: 'response',
        status: response.status,
        headers: response.headers,
        body: new Uint8Array(0),
      };
    }

    const declared = Number(response.headers.get('content-length'));
    if (
      Number.isFinite(declared) &&
      response.headers.get('content-length') !== null &&
      declared > maxBytes
    ) {
      controller.abort();
      void response.body?.cancel().catch(() => undefined);
      return fail('tooLarge');
    }

    // Headers are in: from here the overall body budget applies.
    stopTimer();
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, bodyTimeoutMs);

    const body = await readCapped(response, maxBytes, controller, options.idleTimeoutMs);
    if (body === 'tooLarge') return fail('tooLarge');
    if (body === 'idle') return fail('timeout');
    if (body === 'failed') return fail(timedOut ? 'timeout' : 'network');
    return { kind: 'response', status: response.status, headers: response.headers, body };
  } finally {
    stopTimer();
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
}

async function readCapped(
  response: Response,
  maxBytes: number,
  controller: AbortController,
  idleTimeoutMs: number | undefined,
): Promise<Uint8Array | 'tooLarge' | 'idle' | 'failed'> {
  const stream = response.body;
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await readChunk(reader, idleTimeoutMs);
      if (next === 'idle') {
        controller.abort();
        void reader.cancel().catch(() => undefined);
        return 'idle';
      }
      const { done, value } = next;
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        // Cancel the reader AND abort the request: the abort is what drops the connection.
        controller.abort();
        void reader.cancel().catch(() => undefined);
        return 'tooLarge';
      }
      chunks.push(value);
    }
  } catch {
    controller.abort();
    return 'failed';
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const IDLE = Symbol('idle');

/** One `reader.read()`, or `'idle'` when no chunk arrives within `idleTimeoutMs`. */
async function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number | undefined,
): Promise<ReadableStreamReadResult<Uint8Array> | 'idle'> {
  if (idleTimeoutMs === undefined) return reader.read();
  let id: ReturnType<typeof setTimeout> | undefined;
  const idle = new Promise<typeof IDLE>((resolve) => {
    id = setTimeout(() => resolve(IDLE), idleTimeoutMs);
  });
  try {
    const next = await Promise.race([reader.read(), idle]);
    return next === IDLE ? 'idle' : next;
  } finally {
    clearTimeout(id);
  }
}

/** UTF-8 + JSON decode. `undefined` when the body is not valid JSON (never throws). */
export function parseJsonBody(body: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
  } catch {
    return undefined;
  }
}
