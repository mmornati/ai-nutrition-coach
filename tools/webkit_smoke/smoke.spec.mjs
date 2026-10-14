// AI Nutrition Coach: browser smoke of the PRODUCTION IMAGE (nginx + the release build), in WebKit
// and Chromium, over http://localhost (a secure context). Real selectors, the real encrypted store.
// Opt-in (scripts/webkit_smoke.sh; CI runs it from scripts/ci/image.sh). It checks what the unit
// tests and the preview-server e2e cannot: the real server's headers and CSP in a real browser.
//
//   1. the page loads, the web manifest + icons are valid, the service worker registers, takes
//      control and precaches EXACTLY the files of precache-manifest.json (and no CSP violation);
//   2. first run: create a passphrase (PBKDF2 -> sqlite3mc wasm in OPFS), log a plate by Type it,
//      see it on Today; the durable-storage line is shown; reload -> locked -> unlock -> the plate
//      is still there;
//   3. OFFLINE: the context goes offline, the page reloads from the service worker, unlock, plate;
//   4. UPDATE: the served build id changes; the new worker installs and WAITS; the calm "A new
//      version is ready" line appears; Reload reloads exactly once; old caches are deleted; the
//      data is still there after unlocking again;
//   5. (Chromium only) BARCODE: a fake camera shows an EAN-13, the one-time Open Food Facts notice
//      appears BEFORE anything is sent, and after OK exactly one request leaves: GET
//      /api/v2/product/<code>?fields=... with no Referer, Cookie or Authorization (the request is
//      intercepted and answered here; nothing real is contacted). Privacy audit PV7;
//   6. EXPORT: Your data -> Export downloads a plain CSV and no request leaves this origin (PV8);
//   7. in EVERY test: no request to any other origin except the one deliberate OFF lookup of
//      step 5 (every other origin is aborted and recorded), no Content-Security-Policy violation,
//      no uncaught page error.
//
// Why step 5 is Chromium-only: Playwright's WebKit has no fake camera device. Everything else runs
// in both.
//
// Environment: BASE_URL (default http://localhost:8080), PWA_DIR (the directory the server renders
// sw.js / precache-manifest.json into, mounted read-write here: the smoke plays "a new build was
// deployed" by changing the build id there), BROWSERS (comma list).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test as base } from '@playwright/test';
import { CAMERA_CLIP, EAN } from './playwright.config.mjs';

const PASSPHRASE = 'correct horse battery staple';
const OFF_HOST = 'world.openfoodfacts.org';
const OFF_FIELDS = 'product_name,product_name_en,generic_name,brands,categories_tags';
const CACHE_PREFIX = 'ai-nutrition-coach-precache-';
const PWA_DIR = process.env['PWA_DIR'] || '';

const test = base.extend({
  // A PERSISTENT context (an ephemeral WebKit context has no OPFS), with every request recorded
  // and every other origin blocked.
  context: async ({ playwright, browserName, baseURL }, provide, testInfo) => {
    const profile = mkdtempSync(join(tmpdir(), 'anc-smoke-profile-'));
    const context = await playwright[browserName].launchPersistentContext(profile, {
      baseURL,
      ...(browserName === 'chromium'
        ? {
            permissions: ['camera'],
            args: [
              '--use-fake-ui-for-media-stream',
              '--use-fake-device-for-media-stream',
              `--use-file-for-fake-video-capture=${CAMERA_CLIP}`,
            ],
          }
        : {}),
    });
    const origin = new URL(baseURL).origin;
    const watch = { offOrigin: [], offSeen: [], violations: [], errors: [] };
    // OFF is answered locally (with CORS) and recorded; any other origin is aborted and recorded.
    await context.route(
      (url) => ['http:', 'https:'].includes(url.protocol) && url.origin !== origin,
      async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.hostname !== OFF_HOST) {
          watch.offOrigin.push(request.url());
          await route.abort();
          return;
        }
        watch.offSeen.push({
          url: request.url(),
          method: request.method(),
          headers: await request.allHeaders(),
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            status: 1,
            product: {
              product_name: 'Nutella',
              brands: 'Ferrero',
              categories_tags: ['en:spreads', 'en:sweet-spreads'],
            },
          }),
        });
      },
    );
    context.on('page', (page) => {
      page.on('pageerror', (e) => watch.errors.push(e.message));
      page.on('console', (m) => {
        if (/Content Security Policy|Refused to/i.test(m.text())) watch.violations.push(m.text());
      });
    });
    testInfo.annotations.push({ type: 'profile', description: profile });
    await provide(Object.assign(context, { watch }));
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  },
  page: async ({ context }, provide) => {
    const page = context.pages()[0] ?? (await context.newPage());
    // Only reached for the pages opened by launchPersistentContext before the listener existed.
    page.on('pageerror', (e) => context.watch.errors.push(e.message));
    page.on('console', (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) context.watch.violations.push(m.text());
    });
    await provide(page);
    expect(context.watch.violations, 'Content-Security-Policy violations').toEqual([]);
    expect(context.watch.errors, 'uncaught page errors').toEqual([]);
  },
});

test.describe.configure({ mode: 'serial' });

// ── the same steps as the app's real screens ───────────────────────────────

async function resetOrigin(page) {
  await page.goto('/favicon.svg');
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const n of await caches.keys()) await caches.delete(n);
    localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
    for (const db of await indexedDB.databases()) {
      if (!db.name) continue;
      await new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(db.name);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
    }
  });
}

async function createStore(page) {
  await expect(page.getByRole('heading', { level: 1, name: 'About this app' })).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Protect your history' })).toBeVisible();
  await page.getByLabel('Passphrase', { exact: true }).fill(PASSPHRASE);
  await page.getByLabel('Confirm passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Create and unlock' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({ timeout: 30_000 });
}

/** Unlock after a reload; the reloaded page may still be letting go of the tab lock for a moment. */
async function unlockAfterReload(page) {
  const today = page.getByRole('heading', { level: 1, name: 'Today' });
  for (let attempt = 0; attempt < 8; attempt++) {
    await expect(page.getByRole('heading', { level: 1, name: 'Unlock your store' })).toBeVisible();
    await page.getByLabel('Passphrase', { exact: true }).fill(PASSPHRASE);
    await page.getByRole('button', { name: 'Unlock' }).click();
    try {
      await expect(today).toBeVisible({ timeout: 8_000 });
      return;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  await expect(today).toBeVisible();
}

const plates = (page) => page.locator('[data-testid^="open-plate-"]');

async function logSalmonByTypingIt(page) {
  await page.getByRole('button', { name: 'Log a plate' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Log a plate' });
  await sheet.getByRole('button', { name: /Type it/ }).click();
  const typeIt = page.getByRole('dialog', { name: 'Add a food' });
  await typeIt.getByLabel('Food search').fill('salm');
  await typeIt.getByRole('button', { name: /^Salmon, Protein/ }).click();
  await typeIt.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}

/** A first run with one plate logged, controlled by the service worker. */
async function installedWithOnePlate(page) {
  await resetOrigin(page);
  await page.goto('/');
  await createStore(page);
  await logSalmonByTypingIt(page);
  await expect(plates(page)).toHaveCount(1);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await unlockAfterReload(page);
  await expect(plates(page)).toHaveCount(1);
}

const cacheNames = (page) =>
  page.evaluate(async (prefix) => (await caches.keys()).filter((n) => n.startsWith(prefix)).sort(), CACHE_PREFIX);

const cachedUrls = (page, name) =>
  page.evaluate(async (n) => {
    const cache = await caches.open(n);
    return (await cache.keys()).map((r) => new URL(r.url).pathname.slice(1)).sort();
  }, name);

const served = async (page, path) => (await page.request.get(path)).json();

test.afterEach(async ({ context }) => {
  expect(context.watch.offOrigin, 'requests to another origin').toEqual([]);
});

// ── 1. manifest, worker, precache ──────────────────────────────────────────

test('the web manifest and icons are valid; the worker registers and precaches exactly the manifest', async ({ page }) => {
  await resetOrigin(page);
  await page.goto('/');
  await expect(page).toHaveTitle('AI Nutrition Coach');

  const manifest = await served(page, '/manifest.webmanifest');
  expect(manifest).toMatchObject({
    id: '/',
    name: 'AI Nutrition Coach',
    short_name: 'Nutrition Coach',
    display: 'standalone',
    orientation: 'portrait',
    scope: '/',
    start_url: '/',
    theme_color: '#0E1A3A',
    categories: ['health', 'food', 'lifestyle'],
  });
  const purposes = manifest.icons.map((i) => `${i.sizes}:${i.purpose}`).sort();
  expect(purposes).toEqual(['192x192:any', '192x192:maskable', '512x512:any', '512x512:maskable']);
  for (const icon of [...manifest.icons.map((i) => i.src), '/icons/apple-touch-icon.png']) {
    const r = await page.request.get(icon);
    expect(r.status(), icon).toBe(200);
    expect(r.headers()['content-type'], icon).toBe('image/png');
  }
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveCount(1);
  expect(await page.evaluate(() => isSecureContext)).toBe(true);

  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const precache = await served(page, '/precache-manifest.json');
  expect(await cacheNames(page)).toEqual([`${CACHE_PREFIX}${precache.buildId}`]);
  expect(await cachedUrls(page, `${CACHE_PREFIX}${precache.buildId}`)).toEqual(
    precache.files.map((f) => f.url).sort(),
  );
  // The build id is <bundle id>-<12 hex of the rendered headers' hash>.
  expect(precache.buildId).toMatch(/^[0-9a-f]{16}-[0-9a-f]{12}$/);
  // The worker is the real one: a registration at scope /, for /sw.js.
  expect(
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return [r?.scope, r?.active?.scriptURL];
    }),
  ).toEqual([new URL('/', page.url()).href, new URL('/sw.js', page.url()).href]);
});

// ── 2 + 3. create, log, reload, unlock, offline ────────────────────────────

test('create a passphrase, log a plate, see the storage line; reload, unlock, the plate is there; then OFFLINE too', async ({
  page,
  context,
  browserName,
}) => {
  await resetOrigin(page);
  await page.goto('/');
  await createStore(page);
  // The durable-storage answer (protected or not, depending on the browser), shown quietly on Today.
  await expect(page.getByText(/^Storage: /)).toBeVisible();
  await logSalmonByTypingIt(page);
  await expect(plates(page)).toHaveCount(1);
  await expect(page.getByText('Salmon')).toBeVisible();

  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await unlockAfterReload(page);
  await expect(plates(page)).toHaveCount(1);
  await expect(page.getByText('Salmon')).toBeVisible();

  // OFFLINE: the page reloads from the worker's precache; the store is still on disk.
  // Playwright 1.63's WebKit build fails a reload under `setOffline(true)` when a service worker
  // controls the page ("WebKit encountered an internal error"; fixed in the 1.64 build), so this
  // step runs in Chromium only until the pin moves; apps/web/e2e/pwa.spec.ts covers WebKit's
  // offline reload (it takes the origin away instead).
  if (browserName === 'webkit') {
    test.info().annotations.push({
      type: 'skipped step',
      description: 'offline reload: setOffline + service worker is broken in WebKit 1.63',
    });
    return;
  }
  await context.setOffline(true);
  await page.reload();
  await unlockAfterReload(page);
  await expect(plates(page)).toHaveCount(1);
  await expect(page.getByText('Salmon')).toBeVisible();
  await context.setOffline(false);
});

// ── 4. update ──────────────────────────────────────────────────────────────

test('update: new build id -> waits -> banner -> Reload once -> old caches deleted -> data intact', async ({ page }) => {
  test.skip(!PWA_DIR, 'PWA_DIR (the rendered sw.js directory) is not mounted');
  const swFile = join(PWA_DIR, 'sw.js');
  const manifestFile = join(PWA_DIR, 'precache-manifest.json');
  const originalSw = readFileSync(swFile, 'utf8');
  const originalManifest = readFileSync(manifestFile, 'utf8');
  try {
    await installedWithOnePlate(page);
    const oldId = (await served(page, '/precache-manifest.json')).buildId;
    expect(await cacheNames(page)).toEqual([`${CACHE_PREFIX}${oldId}`]);
    await expect(page.getByText(/A new version is ready/)).toHaveCount(0);

    // "Deploy" a new version: a new build id in sw.js AND the manifest (what a CSP-only redeploy does).
    const newId = `${oldId}-u${Date.now().toString(36)}`;
    writeFileSync(swFile, originalSw.replace(/^const BUILD_ID = '[^']*';/m, `const BUILD_ID = '${newId}';`));
    writeFileSync(manifestFile, originalManifest.replace(/"buildId": "[^"]*"/, `"buildId": "${newId}"`));
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
    });

    // It installs and WAITS: both caches exist, the page still runs the old build.
    await expect.poll(() => cacheNames(page)).toEqual([`${CACHE_PREFIX}${oldId}`, `${CACHE_PREFIX}${newId}`].sort());
    await expect(page.getByRole('status').getByText(/A new version is ready/)).toBeVisible();

    let navigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations++;
    });
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Unlock your store' })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2_000); // a second, unwanted reload would show up here
    expect(navigations).toBe(1);

    await expect.poll(() => cacheNames(page)).toEqual([`${CACHE_PREFIX}${newId}`]);
    expect((await served(page, '/precache-manifest.json')).buildId).toBe(newId);
    await expect(page.getByText(/A new version is ready/)).toHaveCount(0);
    await unlockAfterReload(page);
    await expect(plates(page)).toHaveCount(1);
    await expect(page.getByText('Salmon')).toBeVisible();
  } finally {
    writeFileSync(swFile, originalSw);
    writeFileSync(manifestFile, originalManifest);
  }
});

// ── 5. barcode (Chromium) ──────────────────────────────────────────────────

test('barcode with a fake camera: the notice comes first, then exactly one GET to Open Food Facts with no Referer, Cookie or Authorization', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'only Chromium has a fake camera device');
  // A cookie for the OFF host: it must NOT be sent (credentials: omit).
  await context.addCookies([
    { name: 'session', value: 'secret', domain: OFF_HOST, path: '/', secure: true, sameSite: 'None' },
  ]);
  await resetOrigin(page);
  await page.goto('/');
  await createStore(page);

  await page.getByRole('button', { name: 'Log a plate' }).first().click();
  await page.getByRole('dialog', { name: 'Log a plate' }).getByRole('button', { name: /Barcode/ }).click();
  // The decoded EAN is about to leave the device: the one-time notice asks FIRST.
  await expect(page.getByText('Barcode lookups')).toBeVisible({ timeout: 60_000 });
  expect(context.watch.offSeen, 'nothing is sent before the person says OK').toHaveLength(0);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByText('Nutella')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_500);

  expect(context.watch.offSeen).toHaveLength(1);
  const only = context.watch.offSeen[0];
  const url = new URL(only.url);
  expect(only.method).toBe('GET');
  expect(url.origin).toBe(`https://${OFF_HOST}`);
  expect(url.pathname).toBe(`/api/v2/product/${EAN}`);
  expect([...url.searchParams.keys()]).toEqual(['fields']);
  expect(url.searchParams.get('fields')).toBe(OFF_FIELDS);
  const names = Object.keys(only.headers).map((h) => h.toLowerCase());
  for (const forbidden of ['referer', 'cookie', 'authorization', 'x-forwarded-for']) {
    expect(names, forbidden).not.toContain(forbidden);
  }
  // The deliberate lookup is the ONLY off-origin traffic; the afterEach hook asserts nothing else.
});

// ── 6. export ──────────────────────────────────────────────────────────────

test('export is a plain CSV and no request leaves this origin', async ({ page, context }) => {
  // A phone shares the file; a desktop test browser downloads it. Force the download path.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined });
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined });
  });
  await resetOrigin(page);
  await page.goto('/');
  await createStore(page);
  await logSalmonByTypingIt(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /^Your data/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your data' })).toBeVisible();
  await expect(page.getByText(/Exports are plain, unencrypted files/)).toBeVisible();

  const before = context.watch.offSeen.length;
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2}-ai-nutrition-coach\.csv$/);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  const rows = text.trim().split('\n');
  expect(rows[0]).toMatch(/^id,logged_at_utc,entry_id,/);
  expect(rows).toHaveLength(2);
  expect(rows[1]).toContain('Salmon');
  expect(text.startsWith('PK')).toBe(false); // not a zip, not encrypted: a plain CSV
  await expect(page.getByText(/^exported:/)).toBeVisible();
  expect(context.watch.offSeen.length).toBe(before);
  // (the afterEach hook asserts that no other origin was contacted at all)
});
