import { describe, expect, it } from 'vitest';
import { SyncOfferSource } from './offer';
import type { FetchLike } from '../../net/capped-fetch';

const config = { enabled: true, v: 1, identity: 'handle', signup: 'open', maxVaultMb: 20 };

function source(
  reply: () => Response | Promise<Response>,
  calls: RequestInit[] = [],
): SyncOfferSource {
  const fetch: FetchLike = (_url, init = {}) => {
    calls.push(init);
    return Promise.resolve(reply());
  };
  return new SyncOfferSource({ fetch });
}

const opaqueRedirect = (): Response => {
  const r = new Response(null, { status: 200 });
  Object.defineProperty(r, 'type', { value: 'opaqueredirect' });
  Object.defineProperty(r, 'status', { value: 0 });
  return r;
};

describe('SyncOfferSource behind a sign-in', () => {
  it('reads /sync/config.json with the sign-in cookie and no redirect following', async () => {
    const calls: RequestInit[] = [];
    const s = source(() => new Response(JSON.stringify(config)), calls);
    await s.refresh();
    expect(calls[0]?.credentials).toBe('same-origin');
    expect(calls[0]?.redirect).toBe('manual');
    expect(s.getSnapshot().offered).toBe(true);
    expect(s.getSignInRequired()).toBe(false);
  });

  it('a sign-in redirect, 401 or 403 is "sign in again", and a good read clears it', async () => {
    for (const make of [
      opaqueRedirect,
      () => new Response('', { status: 401 }),
      () => new Response('', { status: 403 }),
    ]) {
      let reply: () => Response = make;
      const s = source(() => reply());
      let notified = 0;
      s.subscribe(() => (notified += 1));
      await s.refresh();
      expect(s.getSnapshot().offered).toBe(false);
      expect(s.getSignInRequired()).toBe(true);
      expect(notified).toBe(1);
      reply = () => new Response(JSON.stringify(config));
      await s.refresh();
      expect(s.getSnapshot().offered).toBe(true);
      expect(s.getSignInRequired()).toBe(false);
    }
  });

  it('a 404, a 500 or an offline host is not a sign-in problem', async () => {
    for (const make of [
      () => new Response('', { status: 404 }),
      () => new Response('', { status: 500 }),
    ]) {
      const s = source(make);
      await s.refresh();
      expect(s.getSignInRequired()).toBe(false);
    }
    const offline = new SyncOfferSource({ fetch: () => Promise.reject(new TypeError('offline')) });
    await offline.refresh();
    expect(offline.getSignInRequired()).toBe(false);
  });
});
