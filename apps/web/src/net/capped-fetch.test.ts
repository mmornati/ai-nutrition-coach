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
  isSameOriginUrl,
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

describe('same-origin credentials (instance behind a single-sign-on proxy)', () => {
  const stubOrigin = (): void => {
    vi.stubGlobal('location', { origin: 'https://nutrition.example.test' });
  };
  afterEach(() => vi.unstubAllGlobals());

  it('sends the session cookie to this server own paths when asked, and still never follows a redirect', async () => {
    stubOrigin();
    const f = new FakeFetch();
    for (const url of [
      '/ai/config.json',
      '/sync/v1/salt',
      'https://nutrition.example.test/ai/v1/chat/completions',
    ]) {
      const r = await cappedFetch(url, { sameOriginCredentials: true, fetchImpl: f.fetch });
      expect(r.kind).toBe('response');
      expect(f.last.init.credentials).toBe('same-origin');
      expect(f.last.init.redirect).toBe('manual');
      expect(f.last.init.referrerPolicy).toBe('no-referrer');
    }
  });

  it('every cross-origin call keeps credentials omit, option or not', async () => {
    stubOrigin();
    const f = new FakeFetch();
    for (const url of [
      'https://world.openfoodfacts.org/api/v2/product/1.json',
      'https://api.example.test/v1/chat/completions',
      'http://nutrition.example.test/ai/config.json', // same host, other scheme
      'https://nutrition.example.test:8443/ai/config.json', // same host, other port
    ]) {
      const r = await cappedFetch(url, { fetchImpl: f.fetch });
      expect(r.kind).toBe('response');
      expect(f.last.init.credentials).toBe('omit');
    }
    // A same-origin call that did not ask is also cookieless.
    await cappedFetch('/ai/config.json', { fetchImpl: f.fetch });
    expect(f.last.init.credentials).toBe('omit');
  });

  it('refuses the option for a URL that is not this origin: nothing is sent', async () => {
    stubOrigin();
    const f = new FakeFetch();
    for (const url of [
      'https://api.example.test/v1/chat/completions',
      '//evil.example.test/ai/config.json',
      '/\\evil.example.test/ai/config.json',
      'https://nutrition.example.test.evil.test/ai/config.json',
      'http://nutrition.example.test/ai/config.json',
      '/\t/evil.example.test/ai/config.json',
      'http://[bad',
    ]) {
      const r = await cappedFetch(url, { sameOriginCredentials: true, fetchImpl: f.fetch });
      expect(r).toEqual({ kind: 'failure', reason: 'network' });
    }
    expect(f.requests).toHaveLength(0);
  });

  it('isSameOriginUrl: only a plain path counts without a location', () => {
    vi.stubGlobal('location', undefined);
    expect(isSameOriginUrl('/ai/config.json')).toBe(true);
    expect(isSameOriginUrl('https://nutrition.example.test/ai/config.json')).toBe(false);
    expect(isSameOriginUrl('//host/x')).toBe(false);
    for (const bad of [
      '/\t/evil.test/x',
      '/\r/evil.test/x',
      '/\n/evil.test/x',
      '/\\evil.test/x',
      '/a\\b',
    ]) {
      expect(isSameOriginUrl(bad)).toBe(false);
    }
  });

  it('isSameOriginUrl: with a location it asks the URL parser, so tricks resolving elsewhere are refused', () => {
    vi.stubGlobal('location', { origin: 'https://app.test', href: 'https://app.test/#/x' });
    expect(isSameOriginUrl('/ai/config.json')).toBe(true);
    expect(isSameOriginUrl('https://app.test/ai/config.json')).toBe(true);
    for (const bad of [
      '/\t/evil.test/x',
      '/\r\n/evil.test/x',
      '/\\evil.test/x',
      '//evil.test/x',
      'https://evil.test/x',
      'https://app.test.evil.test/x',
      'http://app.test/x',
      'http://[bad',
    ]) {
      expect(isSameOriginUrl(bad)).toBe(false);
    }
  });
});
