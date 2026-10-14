import { describe, expect, it } from 'vitest';
import {
  BODY_READ_TIMEOUT_MS,
  CONNECT_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  PING_RECEIVE_TIMEOUT_MS,
  RECEIVE_TIMEOUT_MS,
  RequestFailedError,
  RequestTimeoutError,
  ResponseTooLargeError,
  SEND_TIMEOUT_MS,
  postJson,
} from './capped-post';
import { FakeFetch, endlessStream } from './testing';

const post = (
  f: FakeFetch,
  o: Parameters<typeof postJson>[3] extends infer P ? Partial<P> : never = {},
) =>
  postJson(
    'https://api.example.com/x',
    { a: 1 },
    { 'Content-Type': 'application/json' },
    {
      fetch: f.fetch,
      ...o,
    },
  );

describe('network hygiene', () => {
  it('pins the product timeouts and the 2 MiB cap', () => {
    expect(CONNECT_TIMEOUT_MS).toBe(10_000);
    expect(SEND_TIMEOUT_MS).toBe(30_000);
    expect(RECEIVE_TIMEOUT_MS).toBe(45_000);
    expect(PING_RECEIVE_TIMEOUT_MS).toBe(20_000);
    expect(BODY_READ_TIMEOUT_MS).toBe(60_000);
    expect(MAX_RESPONSE_BYTES).toBe(2 * 1024 * 1024);
  });

  it('never follows redirects, sends no credentials and passes exactly the headers it is given', async () => {
    const f = new FakeFetch();
    f.jsonBody = { ok: true };
    const r = await post(f);
    expect(r.json).toEqual({ ok: true });
    expect(f.last.init.redirect).toBe('manual');
    expect(f.last.init.credentials).toBe('omit');
    expect(Object.keys(f.last.headers)).toEqual(['content-type']);
  });

  it('a 3xx is returned as a status (the caller treats it as a failure); its body is never read', async () => {
    const f = new FakeFetch();
    f.status = 301;
    f.headers = { location: 'https://evil.example.net' };
    const r = await post(f);
    expect(r.status).toBe(301);
    expect(r.json).toBeUndefined();
    expect(f.requests).toHaveLength(1);
  });

  it('aborts a streamed body past the cap and cancels the stream', async () => {
    const f = new FakeFetch();
    const s = endlessStream(256 * 1024);
    f.stream = s.stream;
    await expect(post(f)).rejects.toBeInstanceOf(ResponseTooLargeError);
    expect(s.cancelled()).toBe(true);
    expect(s.pulls()).toBeLessThan(40);
  });

  it('a body that dribbles past the overall read budget is aborted', async () => {
    const f = new FakeFetch();
    let timer: ReturnType<typeof setInterval> | undefined;
    f.stream = new ReadableStream<Uint8Array>({
      start(c) {
        timer = setInterval(() => c.enqueue(new Uint8Array(1)), 5);
      },
      cancel() {
        clearInterval(timer);
      },
    });
    await expect(post(f, { bodyReadTimeoutMs: 60 })).rejects.toBeInstanceOf(RequestTimeoutError);
    clearInterval(timer);
  });

  it('a stalled body hits the idle (receive) timeout', async () => {
    const f = new FakeFetch();
    f.stream = new ReadableStream<Uint8Array>({ start() {} });
    await expect(post(f, { receiveTimeoutMs: 30 })).rejects.toBeInstanceOf(RequestTimeoutError);
  });

  it('a fetch rejection (offline, CORS, CSP) is a RequestFailedError', async () => {
    const f = new FakeFetch();
    f.error = new TypeError('Failed to fetch');
    await expect(post(f)).rejects.toBeInstanceOf(RequestFailedError);
  });

  it('an unparsable 2xx body is undefined, not an exception', async () => {
    const f = new FakeFetch();
    f.stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('not json'));
        c.close();
      },
    });
    expect((await post(f)).json).toBeUndefined();
  });
});
