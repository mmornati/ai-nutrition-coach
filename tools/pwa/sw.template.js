/* AI Nutrition Coach service worker (ADR-0003, docs/pwa.md).
 *
 * GENERATED into the release bundle by tools/generate_precache_manifest.mjs
 * from this template: the build id below changes whenever any shipped file
 * does, so the browser sees a different sw.js and runs the update flow.
 *
 * Strategy
 *   install   precache every file in precache-manifest.json (cache-busting
 *             fetch, each body verified against its SHA-256) into a cache
 *             named after the build id (the stored responses keep the
 *             network response's headers, CSP included, minus wire-encoding
 *             headers and set-cookie). A failure aborts the install: the old
 *             version keeps running and the browser retries later. The new
 *             worker then WAITS; it never skipWaiting()s on its own.
 *   message   {type: 'SKIP_WAITING'} (sent when the user taps "Reload") ->
 *             skipWaiting().
 *   activate  delete every OTHER ai-nutrition-coach-precache-* cache, claim clients.
 *   fetch     GET, same-origin only:
 *               navigation (no file extension) -> cached index.html, so a page
 *                 load is always ONE consistent build, online or off;
 *               precached asset                -> cache first;
 *               anything else                  -> the network, untouched.
 *             Cross-origin requests (Open Food Facts, a BYOK AI endpoint) and
 *             every non-GET request are never intercepted. Nothing is ever
 *             written to a cache at run time, so no API-like response can end
 *             up cached.
 */
'use strict';

const BUILD_ID = '__AI_NUTRITION_COACH_BUILD_ID__';
const CACHE_PREFIX = 'ai-nutrition-coach-precache-';
const CACHE_NAME = CACHE_PREFIX + BUILD_ID;
const HASH_HEADER = 'x-ai-nutrition-coach-sha256';
const MANIFEST = 'precache-manifest.json';
// Headers describing the wire encoding of the body (the cache stores the
// decoded bytes) or that must never be replayed from a cache.
const DROPPED_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie']);

// Vite emits `<script type="module" crossorigin>`, so the browser's requests are CORS requests
// carrying an `Origin` header; a cached response whose `Vary` names a request header (a server or
// CDN adding `Vary: Origin`, say) would never match them and the app would not boot offline. The
// precache is keyed by exact URL and verified by hash, so `Vary` is ignored on every lookup.
const MATCH_OPTIONS = { ignoreVary: true };

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(buffer) {
  return toHex(await crypto.subtle.digest('SHA-256', buffer));
}

/** Files already cached, with the same hash, by an older build: reuse them. */
async function reusableFrom(oldCaches, request, sha256) {
  for (const old of oldCaches) {
    const hit = await old.match(request, MATCH_OPTIONS);
    if (hit && hit.headers.get(HASH_HEADER) === sha256) return hit;
  }
  return null;
}

async function precache() {
  const manifestResponse = await fetch(scopeUrl(MANIFEST), { cache: 'no-store' });
  if (!manifestResponse.ok) throw new Error('precache manifest unavailable');
  const manifest = await manifestResponse.json();
  if (manifest.buildId !== BUILD_ID) {
    // sw.js and the manifest come from different deployments (a deploy in
    // flight): fail now, the browser retries the whole install later.
    throw new Error('build id mismatch between sw.js and the manifest');
  }
  const cache = await caches.open(CACHE_NAME);
  const oldNames = (await caches.keys()).filter(
    (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME,
  );
  const oldCaches = await Promise.all(oldNames.map((name) => caches.open(name)));

  for (const file of manifest.files) {
    const request = new Request(scopeUrl(file.url));
    // The document is never reused from an older cache: its response headers
    // (the CSP) can change with a deployment while its bytes do not.
    const reused = file.url === 'index.html' ? null : await reusableFrom(oldCaches, request, file.sha256);
    if (reused) {
      await cache.put(request, reused);
      continue;
    }
    const response = await fetch(request, { cache: 'reload' });
    if (!response.ok) throw new Error('precache fetch failed: ' + file.url);
    const body = await response.arrayBuffer();
    if ((await sha256Hex(body)) !== file.sha256) {
      throw new Error('precache checksum mismatch: ' + file.url);
    }
    // A fresh Response (the body was read and verified), but with the
    // network response's HEADERS: the page's security headers (CSP,
    // X-Frame-Options, Permissions-Policy, COOP, nosniff, Referrer-Policy, ...)
    // live on the navigation response, and a cached index.html that lost them
    // would run every returning user without a CSP. Only the headers that
    // describe the WIRE encoding of the body (we store the decoded bytes) or
    // that must never be replayed are dropped.
    const headers = new Headers();
    response.headers.forEach((value, name) => {
      if (!DROPPED_HEADERS.has(name.toLowerCase())) headers.append(name, value);
    });
    headers.set(HASH_HEADER, file.sha256);
    await cache.put(request, new Response(body, { status: 200, headers }));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

const looksLikeAFile = (pathname) => /\.[A-Za-z0-9]+$/.test(pathname);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && !looksLikeAFile(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const shell = await cache.match(scopeUrl('index.html'), MATCH_OPTIONS);
        return shell || fetch(request);
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Query strings (cache busters such as ?v=) never match a precached
      // file and would 404 the cache; match on the path.
      const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
      return hit || fetch(request);
    })(),
  );
});
