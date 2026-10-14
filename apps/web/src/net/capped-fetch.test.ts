// Network hygiene for every client (N3): 2 MiB cap, bounded waits, no redirects, no ambient
// credentials. Port of the behaviour of the earlier client and the off/openai provider tests.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BODY_READ_TIMEOUT_MS,
  CONNECT_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  PING_RECEIVE_TIMEOUT_MS,
  RECEIVE_TIMEOUT_MS,
  SEND_TIMEOUT_MS,
  cappedFetch,
  parseJsonBody,
} from './capped-fetch';
import { FakeFetch } from './testing';

afterEach(() => vi.useRealTimers());

describe('constants', () => {
  it('2 MiB, 10 s / 30 s / 45 s, ping 20 s, body budget 60 s', () => {
    expect(MAX_RESPONSE_BYTES).toBe(2 * 1024 * 1024);
    expect(CONNECT_TIMEOUT_MS).toBe(10_000);
    expect(SEND_TIMEOUT_MS).toBe(30_000);
    expect(RECEIVE_TIMEOUT_MS).toBe(45_000);
    expect(PING_RECEIVE_TIMEOUT_MS).toBe(20_000);
    expect(BODY_READ_TIMEOUT_MS).toBe(60_000);
  });
});

describe('cappedFetch', () => {
  it('reads a small JSON body and sends only what the caller set', async () => {
    const f = new FakeFetch();
    f.jsonBody = { ok: true };
    const r = await cappedFetch('https://example.test/x', {
      headers: { Accept: 'application/json' },
      fetchImpl: f.fetch,
    });
    expect(r.kind).toBe('response');
    if (r.kind !== 'response') return;
    expect(r.status).toBe(200);
    expect(parseJsonBody(r.body)).toEqual({ ok: true });
    const init = f.last.init;
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect(init.redirect).toBe('manual');
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(init.body).toBeUndefined();
  });

  it('a response past 2 MiB is aborted near the cap', async () => {
    const f = new FakeFetch();
    f.chunks = () => new Uint8Array(256 * 1024);
    const r = await cappedFetch('https://example.test/x', { fetchImpl: f.fetch });
    expect(r).toEqual({ kind: 'failure', reason: 'tooLarge' });
    expect(f.aborted).toBeGreaterThanOrEqual(1); // the request was cancelled
    const emitted = f.chunksEmitted;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(f.chunksEmitted).toBeLessThanOrEqual(emitted + 1); // the stream stopped being read
    expect(emitted).toBeLessThan(40);
  });

  it('an over-long Content-Length is refused before reading', async () => {
    const f = new FakeFetch();
    f.responseHeaders = { 'content-length': String(MAX_RESPONSE_BYTES + 1) };
    f.jsonBody = {};
    expect(await cappedFetch('https://example.test/x', { fetchImpl: f.fetch })).toEqual({
      kind: 'failure',
      reason: 'tooLarge',
    });
  });

  it('a body exactly at the cap is accepted', async () => {
    const f = new FakeFetch();
    f.jsonBody = 'x'.repeat(100);
    const r = await cappedFetch('https://example.test/x', { maxBytes: 100, fetchImpl: f.fetch });
    expect(r.kind).toBe('response');
  });

  it('redirects are never followed: a 3xx and an opaque redirect are failures', async () => {
    const f = new FakeFetch();
    f.status = 302;
    f.responseHeaders = { location: 'https://evil.example.net/' };
    expect(await cappedFetch('https://example.test/x', { fetchImpl: f.fetch })).toEqual({
      kind: 'failure',
      reason: 'redirect',
    });
    expect(f.requests).toHaveLength(1);

    const opaque = (async () => {
      const res = new Response(null, { status: 200 });
      Object.defineProperty(res, 'type', { value: 'opaqueredirect' });
      return res;
    }) as unknown as typeof fetch;
    expect(await cappedFetch('https://example.test/x', { fetchImpl: opaque })).toEqual({
      kind: 'failure',
      reason: 'redirect',
    });
  });

  it('a non-2xx status is returned without reading its body', async () => {
    const f = new FakeFetch();
    f.status = 503;
    f.jsonBody = { error: 'down' };
    const r = await cappedFetch('https://example.test/x', { fetchImpl: f.fetch });
    expect(r).toMatchObject({ kind: 'response', status: 503 });
    if (r.kind === 'response') expect(r.body.length).toBe(0);
  });

  it('a transport error is a typed failure, never a throw', async () => {
    const f = new FakeFetch();
    f.error = new TypeError('Failed to fetch');
    expect(await cappedFetch('https://example.test/x', { fetchImpl: f.fetch })).toEqual({
      kind: 'failure',
      reason: 'network',
    });
  });

  it('waiting for the headers is bounded (45 s)', async () => {
    vi.useFakeTimers();
    const f = new FakeFetch();
    f.hang = true;
    const p = cappedFetch('https://example.test/x', { fetchImpl: f.fetch });
    await vi.advanceTimersByTimeAsync(RECEIVE_TIMEOUT_MS + 1);
    expect(await p).toEqual({ kind: 'failure', reason: 'timeout' });
  });

  it('the overall body read is bounded (60 s) even if the server dribbles', async () => {
    vi.useFakeTimers();
    const f = new FakeFetch();
    f.stallBody = true;
    const p = cappedFetch('https://example.test/x', { fetchImpl: f.fetch });
    await vi.advanceTimersByTimeAsync(BODY_READ_TIMEOUT_MS + 1);
    expect(await p).toEqual({ kind: 'failure', reason: 'timeout' });
    expect(f.aborted).toBeGreaterThanOrEqual(1);
  });

  it('a stalled stream ends at the idle timeout, well before the overall budget', async () => {
    vi.useFakeTimers();
    const f = new FakeFetch();
    f.stallBody = true;
    const p = cappedFetch('https://example.test/x', { fetchImpl: f.fetch, idleTimeoutMs: 5_000 });
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await p).toEqual({ kind: 'failure', reason: 'timeout' });
    expect(f.aborted).toBeGreaterThanOrEqual(1);
  });

  it('a POST sends exactly the body and headers it is given', async () => {
    const f = new FakeFetch();
    f.jsonBody = { ok: 1 };
    const r = await cappedFetch('https://example.test/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
      fetchImpl: f.fetch,
    });
    expect(r.kind).toBe('response');
    expect(f.last.init.method).toBe('POST');
    expect(f.last.init.body).toBe('{"a":1}');
    expect(f.last.init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('an outer abort cancels the request', async () => {
    const f = new FakeFetch();
    f.hang = true;
    const outer = new AbortController();
    const p = cappedFetch('https://example.test/x', { fetchImpl: f.fetch, signal: outer.signal });
    outer.abort();
    expect(await p).toEqual({ kind: 'failure', reason: 'network' });
  });

  it('sends a POST body when given one (used by the BYOK client)', async () => {
    const f = new FakeFetch();
    await cappedFetch('https://example.test/x', {
      method: 'POST',
      body: '{"a":1}',
      fetchImpl: f.fetch,
    });
    expect(f.last.init.method).toBe('POST');
    expect(f.last.init.body).toBe('{"a":1}');
  });
});

describe('parseJsonBody', () => {
  it('is undefined for invalid JSON or invalid UTF-8, never a throw', () => {
    expect(parseJsonBody(new TextEncoder().encode('{not json'))).toBeUndefined();
    expect(parseJsonBody(Uint8Array.from([0xff, 0xfe, 0xfd]))).toBeUndefined();
    expect(parseJsonBody(new TextEncoder().encode('null'))).toBeNull();
  });
});
