import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRelayClient } from './client';
import type { FetchLike } from '../../net/capped-fetch';

afterEach(() => vi.unstubAllGlobals());

const opaqueRedirect = (): Response => {
  const r = new Response(null, { status: 200 });
  Object.defineProperty(r, 'type', { value: 'opaqueredirect' });
  Object.defineProperty(r, 'status', { value: 0 });
  return r;
};

function recorder(reply: () => Response): {
  fetch: FetchLike;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    fetch: (url, init = {}) => {
      calls.push({ url, init });
      return Promise.resolve(reply());
    },
  };
}

describe('the relay client behind a sign-in', () => {
  it('sends the sign-in cookie to this server and still refuses redirects', async () => {
    const r = recorder(() => new Response('{}', { status: 400 }));
    await createRelayClient({ fetch: r.fetch }).salt('handle');
    expect(r.calls[0]?.url).toBe('/sync/v1/salt');
    expect(r.calls[0]?.init.credentials).toBe('same-origin');
    expect(r.calls[0]?.init.redirect).toBe('manual');
  });

  it('a base on another origin is refused before anything is sent (no cookie leaves this server)', async () => {
    vi.stubGlobal('location', { origin: 'https://plate.example.test' });
    const r = recorder(() => new Response('{}'));
    const out = await createRelayClient({
      fetch: r.fetch,
      base: 'https://relay.elsewhere.test',
    }).salt('handle');
    expect(out).toEqual({ kind: 'error', error: 'offline' });
    expect(r.calls).toHaveLength(0);
  });

  it('a redirect to the identity provider is signInRequired, not "offline"', async () => {
    const client = createRelayClient({ fetch: recorder(opaqueRedirect).fetch });
    expect(await client.salt('handle')).toEqual({ kind: 'error', error: 'signInRequired' });
    expect(await client.getVault('t'.repeat(10))).toEqual({
      kind: 'error',
      error: 'signInRequired',
    });
  });

  it('a 401 / 403 without the relay JSON error is signInRequired; the relay own errors keep their meaning', async () => {
    for (const status of [401, 403]) {
      const client = createRelayClient({
        fetch: recorder(() => new Response('<html>sign in</html>', { status })).fetch,
      });
      expect(await client.getVault('t'.repeat(10))).toEqual({
        kind: 'error',
        error: 'signInRequired',
      });
    }
    const own = (status: number, error: string) =>
      createRelayClient({
        fetch: recorder(() => new Response(JSON.stringify({ error }), { status })).fetch,
      });
    expect(await own(401, 'unauthorized').getVault('t'.repeat(10))).toEqual({
      kind: 'error',
      error: 'unauthorized',
    });
    expect(await own(401, 'noMatch').login('handle', 'k')).toEqual({
      kind: 'error',
      error: 'noMatch',
    });
    expect(
      await own(403, 'signupClosed').signup(
        {} as unknown as Parameters<ReturnType<typeof createRelayClient>['signup']>[0],
      ),
    ).toEqual({ kind: 'error', error: 'signupClosed' });
  });
});
