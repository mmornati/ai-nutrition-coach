// The session is thrown away on every lock: requests in flight are aborted and nothing lands
// after it (src/app/session.tsx).
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeFetch, photoBytes, TEST_KEY } from '../ai/testing';
import { KV_KEYS } from '../storage';
import { createSession } from './session';
import { unlockedBundle } from './testing';

const NUTELLA = '3017620422003';

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('Session.dispose', () => {
  it('a lock mid-lookup aborts the Open Food Facts request and nothing is remembered after it', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.privacyOffLookup, 'allowed');
    const fake = new FakeFetch();
    fake.hang = true;
    const session = await createSession(bundle, { fetch: fake.fetch });

    const lookup = session.catalog.lookupByBarcode(NUTELLA);
    await expect.poll(() => fake.requests.length).toBe(1);
    expect(fake.last.init.signal?.aborted).toBe(false);

    session.dispose();

    expect(fake.last.init.signal?.aborted).toBe(true);
    const result = await lookup;
    expect(result.kind).toBe('catalogFailure');
    expect(session.live()).toBe(false);
    // No result landed: a second try is a new request (nothing was cached).
    expect((session.catalog as unknown as { cachedBarcodes: number }).cachedBarcodes).toBe(0);
  });

  it('a lock mid-request aborts a BYOK call too', async () => {
    const bundle = await unlockedBundle();
    const fake = new FakeFetch();
    fake.hang = true;
    const session = await createSession(bundle, { fetch: fake.fetch });

    const test = session.ai.yourAi.testConnection({
      endpointUrl: 'https://api.example.com/v1',
      model: 'vision-1',
      typedKey: TEST_KEY,
    });
    await expect.poll(() => fake.requests.length).toBe(1);
    expect(fake.last.init.signal?.aborted).toBe(false);

    session.dispose();

    expect(fake.last.init.signal?.aborted).toBe(true);
    const result = await test;
    expect(result).toEqual({ kind: 'unreachable', reason: 'network' });
  });

  it('empties the catalog caches', async () => {
    // The catalogue reads its CIQUAL table from the app's own origin (a precached asset).
    const table = readFileSync('public/catalog/ciqual-2025.json', 'utf8');
    vi.stubGlobal('fetch', async () => new Response(table));
    const bundle = await unlockedBundle();
    const session = await createSession(bundle);
    await session.catalog.search('rice');
    const catalog = session.catalog as unknown as { cachedQueries: number };
    expect(catalog.cachedQueries).toBe(1);
    session.dispose();
    expect(catalog.cachedQueries).toBe(0);
  });

  it('drops an outstanding photo-upload permit, and a grant still being computed', async () => {
    const bundle = await unlockedBundle();
    const session = await createSession(bundle);
    const bytes = photoBytes(1, 2, 3);
    await session.ai.permit.grant({ host: 'api.example.com', bytes });
    session.dispose();
    expect(await session.ai.permit.consume({ host: 'api.example.com', bytes })).toBe(false);

    const second = await createSession(bundle);
    const pending = second.ai.permit.grant({ host: 'api.example.com', bytes });
    second.dispose();
    await pending;
    expect(await second.ai.permit.consume({ host: 'api.example.com', bytes })).toBe(false);
  });

  it('is safe to call twice', async () => {
    const session = await createSession(await unlockedBundle());
    session.dispose();
    expect(() => session.dispose()).not.toThrow();
  });
});
