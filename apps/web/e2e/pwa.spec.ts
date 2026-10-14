// The service worker, end to end, on the real built app and the real encrypted store:
//  - it registers, takes control and precaches EXACTLY the files of precache-manifest.json;
//  - OFFLINE: a reload is answered by the worker; unlock; the plate is still there;
//  - UPDATE: a new build id -> the new worker installs and WAITS (old cache still in place) ->
//    the calm banner appears -> Reload reloads exactly once -> the old cache is deleted -> unlock
//    -> the data is intact.
// The bundle is served by e2e/static-server.ts, which plays "a new version was deployed" by
// changing the build id in sw.js and the manifest. One origin per project (WebKit shares site data
// between contexts of an origin, so the projects must not share a port).
import { fileURLToPath } from 'node:url';
import { type Page } from '@playwright/test';
import { createStore, freshStart, logSalmonByTypingIt, plates, unlockAfterReload } from './flows';
import { expect, test } from './persistent';
import { serveBundle, type TestServer } from './static-server';

const DIST = fileURLToPath(new URL('../dist-e2e', import.meta.url));
const CACHE_PREFIX = 'ai-nutrition-coach-precache-';

test.describe.configure({ mode: 'serial' });

let server: TestServer;
let base = '';

test.beforeAll(async ({ browserName }) => {
  const port = browserName === 'chromium' ? 4175 : 4176;
  server = await serveBundle(DIST, port);
  base = server.origin;
});
test.afterAll(async () => {
  await server.close();
});

const cacheNames = (page: Page): Promise<string[]> =>
  page.evaluate(
    async (prefix) => (await caches.keys()).filter((n) => n.startsWith(prefix)).sort(),
    CACHE_PREFIX,
  );

const cachedUrls = (page: Page, name: string): Promise<string[]> =>
  page.evaluate(async (n) => {
    const cache = await caches.open(n);
    return (await cache.keys()).map((r) => new URL(r.url).pathname.slice(1)).sort();
  }, name);

async function manifest(): Promise<{ buildId: string; files: { url: string }[] }> {
  return (await (await fetch(`${base}/precache-manifest.json`)).json()) as {
    buildId: string;
    files: { url: string }[];
  };
}

/** A previous test's worker or caches (shared site data in WebKit) must not leak into this one. */
async function resetServiceWorkers(page: Page): Promise<void> {
  await page.goto(`${base}/favicon.svg`);
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const n of await caches.keys()) await caches.delete(n);
  });
}

/** Waits until a worker controls the page (a first load installs it; the next load is controlled). */
async function controlled(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('registers, takes control and precaches exactly the manifest; offline reload keeps the data', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  server.setBuildId('e2e-a');
  await resetServiceWorkers(page);
  await freshStart(page, base);
  await createStore(page);
  await logSalmonByTypingIt(page);
  await expect(plates(page)).toHaveCount(1);
  await controlled(page);

  const m = await manifest();
  expect(m.buildId).toBe('e2e-a');
  expect(await cacheNames(page)).toEqual([`${CACHE_PREFIX}e2e-a`]);
  expect(await cachedUrls(page, `${CACHE_PREFIX}e2e-a`)).toEqual(m.files.map((f) => f.url).sort());

  await context.setOffline(true);
  await page.reload();
  await unlockAfterReload(page);
  await expect(plates(page)).toHaveCount(1);
  await expect(page.getByText('Salmon')).toBeVisible();
  await context.setOffline(false);
});

test('update: new build id -> waits -> banner -> Reload once -> old caches deleted -> data intact', async ({
  page,
}) => {
  test.setTimeout(150_000);
  server.setBuildId('e2e-a');
  await resetServiceWorkers(page);
  await freshStart(page, base);
  await createStore(page);
  await logSalmonByTypingIt(page);
  await controlled(page);
  expect(await cacheNames(page)).toEqual([`${CACHE_PREFIX}e2e-a`]);
  await expect(page.getByText(/A new version is ready/)).toHaveCount(0);

  // "Deploy" a new version, then come back to the foreground (the app checks for updates then).
  server.setBuildId('e2e-b');
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });

  // The new worker installs and WAITS: both caches exist, the page is still on the old build.
  await expect
    .poll(() => cacheNames(page))
    .toEqual([`${CACHE_PREFIX}e2e-a`, `${CACHE_PREFIX}e2e-b`]);
  const banner = page.getByRole('status').getByText(/A new version is ready/);
  await expect(banner).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain(
    '/sw.js',
  );

  // Reload: the page reloads exactly once, on the new worker.
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect.poll(() => navigations).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('heading', { level: 1, name: 'Unlock your store' })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(2_000); // a second, unwanted reload would show up here
  expect(navigations).toBe(1);

  // Old caches are gone; the new one holds the new manifest's files; no banner any more.
  await expect.poll(() => cacheNames(page)).toEqual([`${CACHE_PREFIX}e2e-b`]);
  const m = await manifest();
  expect(m.buildId).toBe('e2e-b');
  expect(await cachedUrls(page, `${CACHE_PREFIX}e2e-b`)).toEqual(m.files.map((f) => f.url).sort());
  await expect(page.getByText(/A new version is ready/)).toHaveCount(0);

  // The data is intact: unlock with the same passphrase, the plate is there.
  await unlockAfterReload(page);
  await expect(plates(page)).toHaveCount(1);
  await expect(page.getByText('Salmon')).toBeVisible();
  server.setBuildId('e2e-a');
});
