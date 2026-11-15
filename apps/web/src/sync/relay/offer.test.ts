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

describe('SyncOfferSource when the server is down', () => {
  it('is "unreachable" only for a server that offered before; never for one that never did', async () => {
    localStorage.removeItem('anc.sync.offered');
    let up = false;
    const s = source(() =>
      up ? new Response(JSON.stringify(config)) : new Response('', { status: 502 }),
    );
    await s.refresh();
    expect(s.getUnreachable()).toBe(false); // never offered: nothing is said
    up = true;
    await s.refresh();
    expect(s.getSnapshot().offered).toBe(true);
    up = false;
    await s.refresh();
    expect(s.getSnapshot().offered).toBe(false);
    expect(s.getUnreachable()).toBe(true);
    expect(s.getSignInRequired()).toBe(false);
    up = true;
    await s.refresh();
    expect(s.getUnreachable()).toBe(false);
    localStorage.removeItem('anc.sync.offered');
  });

  it('a 404 forgets the offer: the server stopped offering', async () => {
    localStorage.setItem('anc.sync.offered', '1');
    const s = source(() => new Response('', { status: 404 }));
    await s.refresh();
    expect(s.getUnreachable()).toBe(false);
    expect(localStorage.getItem('anc.sync.offered')).toBeNull();
  });
});
