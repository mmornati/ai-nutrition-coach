// The service worker's behaviour, executed for real (node:vm) against an in-memory CacheStorage,
// a scripted network and Node's WebCrypto. Port + extension of the earlier template pins in
// the earlier client: the worker is the hardened one from the
// earlier build, unchanged, so these are the same promises.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { renderServiceWorker } from '../generate_precache_manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, 'sw.template.js'), 'utf8');
const ORIGIN = 'https://app.test';
const sha = (s) => createHash('sha256').update(s).digest('hex');

class FakeCache {
  entries = new Map();
  puts = 0;
  async put(request, response) {
    this.puts++;
    this.entries.set(new URL(request.url ?? request).href, response);
  }
  async match(request, options = {}) {
    const wanted = new URL(request.url ?? request);
    for (const [key, response] of this.entries) {
      const k = new URL(key);
      if (options.ignoreSearch) {
        if (k.origin + k.pathname === wanted.origin + wanted.pathname) return response.clone();
      } else if (k.href === wanted.href) return response.clone();
    }
    return undefined;
  }
}

class FakeCaches {
  stores = new Map();
  async open(name) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return this.stores.get(name);
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name) {
    return this.stores.delete(name);
  }
}

/**
 * @param files url -> { body, headers? } served by the "network"
 * @param manifestFiles the manifest's files (url, hash computed from `files` unless overridden)
 */
function makeWorker({ buildId = 'b2', files, manifest, caches = new FakeCaches() }) {
  const listeners = {};
  const network = [];
  const m = manifest ?? {
    buildId,
    files: Object.entries(files)
      .filter(([url]) => url !== 'precache-manifest.json')
      .map(([url, f]) => ({ url, sha256: sha(f.body), size: f.body.length })),
  };
  const served = { ...files, 'precache-manifest.json': { body: JSON.stringify(m) } };
  const fetchImpl = vi.fn(async (input, init) => {
    const request = typeof input === 'string' ? new Request(input) : input;
    network.push({ url: request.url, cache: init?.cache });
    const url = new URL(request.url);
    const hit = served[url.pathname.slice(1)];
    if (!hit || url.origin !== ORIGIN) return new Response('not found', { status: 404 });
    return new Response(hit.body, { status: 200, headers: hit.headers ?? {} });
  });
  const self = {
    registration: { scope: `${ORIGIN}/` },
    location: { origin: ORIGIN },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(),
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
  };
  const context = vm.createContext({
    self,
    caches,
    fetch: fetchImpl,
    crypto: globalThis.crypto,
    Request,
    Response,
    Headers,
    URL,
    Promise,
    Array,
    Uint8Array,
    Set,
    Error,
  });
  vm.runInContext(renderServiceWorker(template, buildId), context);

  const waitUntil = async (type, event = {}) => {
    let pending;
    listeners[type]({ ...event, waitUntil: (p) => (pending = p) });
    await pending;
  };
  const dispatchFetch = (request) => {
    let responded;
    listeners['fetch']({ request, respondWith: (p) => (responded = p) });
    return responded; // undefined = not intercepted
  };
  return { self, caches, network, fetchImpl, listeners, install: () => waitUntil('install'), activate: () => waitUntil('activate'), dispatchFetch };
}

const FILES = {
  'index.html': { body: '<html>v2</html>', headers: { 'content-security-policy': "default-src 'self'", 'content-encoding': 'gzip', 'content-length': '999', 'set-cookie': 'a=b', vary: 'Accept-Encoding', 'x-frame-options': 'DENY' } },
  'assets/index-1.js': { body: 'console.log(1)' },
  'sqlite3mc/2.5.1/sqlite3.wasm': { body: 'wasm-bytes' },
};

describe('install', () => {
  it('precaches exactly the manifest into <prefix>-precache-<id>, verified, cache-busting, never skipWaiting', async () => {
    const w = makeWorker({ files: FILES });
    await w.install();
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    expect(await w.caches.keys()).toEqual(['ai-nutrition-coach-precache-b2']);
    const cache = w.caches.stores.get('ai-nutrition-coach-precache-b2');
    expect([...cache.entries.keys()].sort()).toEqual(Object.keys(FILES).map((u) => `${ORIGIN}/${u}`).sort());
    expect(w.network.filter((n) => !n.url.endsWith('precache-manifest.json')).every((n) => n.cache === 'reload')).toBe(true);
    expect(w.network.find((n) => n.url.endsWith('precache-manifest.json')).cache).toBe('no-store');
  });

  it('keeps the network headers (CSP etc.) minus wire-encoding headers and cookies', async () => {
    const w = makeWorker({ files: FILES });
    await w.install();
    const cached = await w.caches.stores.get('ai-nutrition-coach-precache-b2').match(`${ORIGIN}/index.html`);
    expect(cached.headers.get('content-security-policy')).toBe("default-src 'self'");
    expect(cached.headers.get('x-frame-options')).toBe('DENY');
    for (const dropped of ['content-encoding', 'set-cookie', 'vary']) expect(cached.headers.get(dropped)).toBeNull();
    expect(cached.headers.get('content-length')).not.toBe('999');
    expect(cached.headers.get('x-ai-nutrition-coach-sha256')).toBe(sha('<html>v2</html>'));
    expect(await cached.text()).toBe('<html>v2</html>');
  });

  it('a checksum mismatch aborts the install', async () => {
    const m = { buildId: 'b2', files: [{ url: 'index.html', sha256: sha('something else'), size: 1 }] };
    const w = makeWorker({ files: FILES, manifest: m });
    await expect(w.install()).rejects.toThrow(/checksum mismatch: index\.html/);
  });

  it('a failed fetch aborts the install', async () => {
    const m = { buildId: 'b2', files: [{ url: 'gone.js', sha256: sha('x'), size: 1 }] };
    const w = makeWorker({ files: FILES, manifest: m });
    await expect(w.install()).rejects.toThrow(/precache fetch failed: gone\.js/);
  });

  it('a manifest from another deployment (build id mismatch) aborts the install', async () => {
    const w = makeWorker({ files: FILES, manifest: { buildId: 'other', files: [] } });
    await expect(w.install()).rejects.toThrow(/build id mismatch/);
  });

  it('reuses unchanged files from the previous cache, but ALWAYS re-fetches index.html', async () => {
    const caches = new FakeCaches();
    const old = await caches.open('ai-nutrition-coach-precache-b1');
    for (const [url, f] of Object.entries(FILES)) {
      await old.put(new Request(`${ORIGIN}/${url}`), new Response(f.body, { headers: { 'x-ai-nutrition-coach-sha256': sha(f.body) } }));
    }
    const w = makeWorker({ files: FILES, caches });
    await w.install();
    const fetched = w.network.map((n) => new URL(n.url).pathname.slice(1));
    expect(fetched).toContain('index.html');
    expect(fetched).not.toContain('assets/index-1.js');
    expect(fetched).not.toContain('sqlite3mc/2.5.1/sqlite3.wasm');
    // ...and they are in the NEW cache.
    const fresh = caches.stores.get('ai-nutrition-coach-precache-b2');
    expect(fresh.entries.size).toBe(3);
  });

  it('a changed file (different hash) is fetched again', async () => {
    const caches = new FakeCaches();
    const old = await caches.open('ai-nutrition-coach-precache-b1');
    await old.put(new Request(`${ORIGIN}/assets/index-1.js`), new Response('old', { headers: { 'x-ai-nutrition-coach-sha256': sha('old') } }));
    const w = makeWorker({ files: FILES, caches });
    await w.install();
    expect(w.network.map((n) => new URL(n.url).pathname.slice(1))).toContain('assets/index-1.js');
  });
});

describe('waiting and activation', () => {
  it('skipWaiting only on a SKIP_WAITING message', () => {
    const w = makeWorker({ files: FILES });
    w.listeners['message']({ data: { type: 'SOMETHING_ELSE' } });
    w.listeners['message']({ data: null });
    w.listeners['message']({ data: 'SKIP_WAITING' });
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    w.listeners['message']({ data: { type: 'SKIP_WAITING' } });
    expect(w.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('activate deletes every OTHER precache cache (and only those) and claims clients', async () => {
    const caches = new FakeCaches();
    for (const n of ['ai-nutrition-coach-precache-b1', 'ai-nutrition-coach-precache-b2', 'unrelated']) await caches.open(n);
    const w = makeWorker({ files: FILES, caches });
    await w.activate();
    expect((await caches.keys()).sort()).toEqual(['ai-nutrition-coach-precache-b2', 'unrelated']);
    expect(w.self.clients.claim).toHaveBeenCalledTimes(1);
  });
});

describe('fetch', () => {
  async function installed() {
    const w = makeWorker({ files: FILES });
    await w.install();
    w.network.length = 0;
    return w;
  }
  const puts = (w) => [...w.caches.stores.values()].reduce((n, c) => n + c.puts, 0);

  it('never intercepts non-GET or cross-origin requests', async () => {
    const w = await installed();
    expect(w.dispatchFetch(new Request(`${ORIGIN}/api`, { method: 'POST', body: 'x' }))).toBeUndefined();
    expect(w.dispatchFetch(new Request('https://world.openfoodfacts.org/api/v2/product/1'))).toBeUndefined();
    expect(w.dispatchFetch(new Request('https://api.byok.example/v1/chat/completions'))).toBeUndefined();
  });

  it('a navigation without a file extension gets the cached index.html, with no network', async () => {
    const w = await installed();
    const nav = new Request(`${ORIGIN}/board/2026-08-13`);
    Object.defineProperty(nav, 'mode', { value: 'navigate' });
    const res = await w.dispatchFetch(nav);
    expect(await res.text()).toBe('<html>v2</html>');
    expect(w.network).toHaveLength(0);
  });

  it('precached assets are cache-first and ignore the query string', async () => {
    const w = await installed();
    const res = await w.dispatchFetch(new Request(`${ORIGIN}/assets/index-1.js?v=123`));
    expect(await res.text()).toBe('console.log(1)');
    expect(w.network).toHaveLength(0);
  });

  it('anything else goes to the network untouched, and NOTHING is ever written at run time', async () => {
    const w = await installed();
    const before = puts(w);
    const res = await w.dispatchFetch(new Request(`${ORIGIN}/not-precached.json`));
    expect(res.status).toBe(404);
    expect(w.network.map((n) => n.url)).toEqual([`${ORIGIN}/not-precached.json`]);
    await w.dispatchFetch(new Request(`${ORIGIN}/assets/index-1.js`));
    expect(puts(w)).toBe(before);
  });
});

describe('the template, statically', () => {
  const code = template.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*')).join('\n');
  it('contains no absolute URL (no third-party host can be reached)', () => {
    expect(code).not.toContain('http://');
    expect(code).not.toContain('https://');
  });
  it('skipWaiting() appears exactly once, inside the message handler', () => {
    expect(code.match(/skipWaiting\(\)/g)).toHaveLength(1);
    const handler = code.slice(code.indexOf("addEventListener('message'"));
    expect(handler.slice(0, handler.indexOf('});'))).toContain('skipWaiting()');
  });
  it('the fetch handler never writes to a cache', () => {
    const fetchHandler = code.slice(code.indexOf("addEventListener('fetch'"));
    expect(fetchHandler).not.toContain('.put(');
    expect(fetchHandler).not.toContain('.add(');
  });
  it('every cache lookup ignores Vary (a CORS module script sends Origin; `Vary: Origin` must not break offline)', () => {
    expect(code.match(/\.match\(/g)).toHaveLength(3);
    expect(code.match(/ignoreVary: true/g)).toHaveLength(2); // MATCH_OPTIONS + the asset lookup
    expect(code).toContain('MATCH_OPTIONS');
    for (const line of code.split('\n').filter((l) => l.includes('.match('))) {
      expect(line).toMatch(/MATCH_OPTIONS|ignoreVary: true/);
    }
  });
  it('index.html is never reused from an older cache', () => {
    expect(code).toContain("file.url === 'index.html' ? null");
  });
});
