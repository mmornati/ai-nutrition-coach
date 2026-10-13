/* AI Nutrition Coach service worker KILL SWITCH (docs/pwa.md "Kill switch").
 *
 * What it is for: a service worker that serves a broken build from its cache
 * and cannot be talked out of it. Served as /sw.js (start the container with
 * AI_NUTRITION_COACH_SW_KILL=1; see infra/nginx/docker-entrypoint.d/30-render-sw.sh) it
 * replaces the old worker through the browser's normal update check:
 *
 *   install   skipWaiting() at once (no banner, no tap needed);
 *   activate  delete EVERY cache, take control, then navigate each open window
 *             to itself ONCE so it reloads from the network;
 *   fetch     no handler at all: every request goes to the network.
 *
 * It does NOT unregister itself: the app registers /sw.js on every load, so an
 * unregistered kill switch would be re-installed and reload the page again,
 * forever. It stays as an inert, cache-less worker until you redeploy normally
 * (a normal sw.js then replaces it through the usual banner flow).
 *
 * Your data is untouched: caches hold only the app files, never your history
 * (that is the encrypted IndexedDB database).
 */
'use strict';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) await caches.delete(name);
      await self.clients.claim();
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        try {
          await client.navigate(client.url);
        } catch (e) {
          // A window that cannot be navigated is reloaded by hand by the user.
        }
      }
    })(),
  );
});
