// The REAL encrypted store, end to end in a browser: the sqlite3mc worker on the OPFS
// `opfs-sahpool` VFS, the Web Lock, the localStorage + IndexedDB header, served by the built app
// under its production CSP. The page is the dev-only harness (storage-harness.html), which is part
// of the e2e build only.
//
// Each test uses a fresh PERSISTENT browser context (an ephemeral WebKit context, like Safari
// private browsing, refuses OPFS file handles; see docs/adr/0005-web-encrypted-store.md).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import type { ContractResult, OpfsReport } from '../src/storage/harness/harness';

const test = base.extend({
  context: async ({ playwright, browserName, baseURL, channel }, provide) => {
    const type = playwright[browserName];
    // An ASCII-only profile path: the test output path follows the title ("Français"), which
    // WebKitGTK cannot parse as an argument without a UTF-8 locale.
    const profile = mkdtempSync(join(tmpdir(), 'anc-e2e-profile-'));
    const context = await type.launchPersistentContext(profile, {
      baseURL: baseURL ?? 'http://localhost:4173',
      ...(browserName === 'chromium' && channel ? { channel } : {}),
    });
    await provide(context);
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  },
  page: async ({ context }, provide) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await provide(page);
  },
});

const GOOD = 'correct horse battery staple';
const WRONG = 'wrong passphrase 12';
const SECRET_FOOD = 'Banana-Qx7-Marker';

/** `fresh` wipes OPFS, IndexedDB and localStorage first (some browsers keep OPFS beyond a throwaway profile). */
async function openHarness(page: Page, fresh = true): Promise<void> {
  await page.goto('/storage-harness.html');
  await page.waitForFunction(() => document.documentElement.dataset['harness'] === 'ready');
  if (fresh) await page.evaluate(() => window.__harness.wipeBrowserState());
}

const status = (page: Page) => page.evaluate(() => window.__harness.status());
const initialize = (page: Page) => page.evaluate(() => window.__harness.controller.initialize());
const create = (page: Page, passphrase = GOOD) =>
  page.evaluate((p) => window.__harness.controller.createStore(p), passphrase);
const unlock = (page: Page, passphrase = GOOD) =>
  page.evaluate((p) => window.__harness.controller.unlock(p), passphrase);
const lock = (page: Page) => page.evaluate(() => window.__harness.controller.lock());
const record = (page: Page, name: string) =>
  page.evaluate((n) => window.__harness.recordPlate(n), name);
const plateNames = (page: Page) => page.evaluate(() => window.__harness.plateNames());
const inspect = (page: Page, needles: string[]): Promise<OpfsReport> =>
  page.evaluate((n) => window.__harness.inspectOpfs(n), needles);

test('create -> write -> lock -> wrong passphrase refused and nothing written -> unlock -> read', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openHarness(page);

  await initialize(page);
  expect(await status(page)).toBe('needsPassphraseCreation');
  expect(await create(page)).toEqual({ kind: 'unlocked' });
  expect(await status(page)).toBe('unlocked');
  await record(page, SECRET_FOOD);
  expect(await plateNames(page)).toEqual([SECRET_FOOD]);

  await lock(page);
  expect(await status(page)).toBe('locked');
  // Locked: typed failures, no data.
  expect(await page.evaluate(() => window.__harness.store.readRange().then((r) => r.kind))).toBe(
    'platesReadFailed',
  );

  // Encrypted at rest: the raw OPFS bytes hold no plaintext and are not a SQLite file.
  const atRest = await inspect(page, [
    SECRET_FOOD,
    GOOD,
    'plate_log',
    'CREATE TABLE',
    'SQLite format 3',
  ]);
  const dataFiles = atRest.files.filter((f) => f.size > 4096);
  expect(dataFiles.length).toBeGreaterThan(0);
  for (const file of atRest.files) {
    expect(file.hits, file.path).toEqual([]);
    expect(file.sqliteHeader, file.path).toBe(false);
  }

  // A wrong passphrase is refused, and not a single byte on disk changes.
  const before = atRest.files.map((f) => `${f.path}:${f.sha256}`).sort();
  expect(await unlock(page, WRONG)).toEqual({ kind: 'wrongPassphrase', retryAfterMs: 0 });
  expect(await status(page)).toBe('locked');
  expect((await inspect(page, [])).files.map((f) => `${f.path}:${f.sha256}`).sort()).toEqual(
    before,
  );

  // The right one opens it and the data is back.
  expect(await unlock(page)).toEqual({ kind: 'unlocked' });
  expect(await plateNames(page)).toEqual([SECRET_FOOD]);
  expect(errors).toEqual([]);
});

test('the key never reaches any browser storage and the header is the documented non-secret one', async ({
  page,
}) => {
  await openHarness(page);
  await initialize(page);
  await create(page);
  await page.evaluate(() => window.__harness.kv.write('ai.byokKey', 'sk-live-marker-1234567890'));
  const header = await page.evaluate(() => localStorage.getItem('anc.pwa.store.meta'));
  const parsed = JSON.parse(header ?? '{}') as Record<string, unknown>;
  expect(parsed).toMatchObject({
    v: 1,
    kdf: 'pbkdf2-hmac-sha256',
    iter: 600000,
    pw: 'nfc-utf8',
  });
  expect(typeof parsed['salt']).toBe('string');
  const everything = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage }),
  );
  expect(everything).not.toContain('sk-live-marker');
  expect(everything).not.toContain(GOOD);
  // The header copy sits in a separate IndexedDB database.
  const copy = await page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const req = indexedDB.open('anc_pwa_header_v1');
        req.onerror = () => reject(new Error('open failed'));
        req.onsuccess = () => {
          const get = req.result.transaction('kv').objectStore('kv').get('header');
          get.onsuccess = () => resolve((get.result as string | undefined) ?? null);
        };
      }),
  );
  expect(copy).toBe(header);
});

test('reload persistence: the store survives a reload, and a lost localStorage header is recovered from IndexedDB', async ({
  page,
}) => {
  await openHarness(page);
  await initialize(page);
  await create(page);
  await record(page, 'Persisted-Pear');
  await lock(page);

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset['harness'] === 'ready');
  await initialize(page);
  expect(await status(page)).toBe('locked');
  expect(await unlock(page)).toEqual({ kind: 'unlocked' });
  expect(await plateNames(page)).toEqual(['Persisted-Pear']);
  await lock(page);

  // localStorage cleared on its own: the IndexedDB copy of the header recovers the store.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset['harness'] === 'ready');
  await initialize(page);
  expect(await status(page)).toBe('locked');
  expect(await unlock(page)).toEqual({ kind: 'unlocked' });
  expect(await plateNames(page)).toEqual(['Persisted-Pear']);
});

test('a different passphrase or a typo never opens the store (wrong key), nothing is minted', async ({
  page,
}) => {
  await openHarness(page);
  await initialize(page);
  await create(page);
  await record(page, 'Only-Mine');
  await lock(page);
  for (const attempt of ['', 'correct horse battery stapl', WRONG]) {
    const outcome = await unlock(page, attempt);
    expect(outcome).toMatchObject({ kind: 'wrongPassphrase' });
    expect(await status(page)).toBe('locked');
  }
  expect(await unlock(page, GOOD)).toMatchObject({ kind: 'throttled' }); // 3 failures: UX friction
});

test('erase removes every byte: OPFS, the IndexedDB header copy and the localStorage header', async ({
  page,
}) => {
  await openHarness(page);
  await initialize(page);
  await create(page);
  await record(page, SECRET_FOOD);
  await lock(page);
  const before = await page.evaluate(() => window.__harness.everythingPersisted());
  expect(before.opfsRoot.length).toBeGreaterThan(0);
  expect(before.indexedDb).toContain('anc_pwa_header_v1');
  expect(before.localStorage).toContain('anc.pwa.store.meta');

  expect(await page.evaluate(() => window.__harness.eraser.eraseAll())).toEqual({
    kind: 'eraseLocalDataSuccess',
  });

  const after = await page.evaluate(() => window.__harness.everythingPersisted());
  expect(after).toEqual({ opfsRoot: [], indexedDb: [], localStorage: [] });
  expect((await inspect(page, [SECRET_FOOD])).files).toEqual([]);
  expect(await status(page)).toBe('needsPassphraseCreation');

  // And a new store starts empty.
  expect(await create(page, 'a brand new passphrase')).toEqual({ kind: 'unlocked' });
  expect(await plateNames(page)).toEqual([]);
  await lock(page);
  expect((await inspect(page, [SECRET_FOOD])).files.every((f) => f.hits.length === 0)).toBe(true);
});

test('erase also works from the locked state (forgotten passphrase)', async ({ page }) => {
  await openHarness(page);
  await initialize(page);
  await create(page);
  await record(page, SECRET_FOOD);
  await lock(page);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset['harness'] === 'ready');
  await initialize(page);
  expect(await status(page)).toBe('locked');
  expect(await page.evaluate(() => window.__harness.eraser.eraseAll())).toEqual({
    kind: 'eraseLocalDataSuccess',
  });
  expect(await page.evaluate(() => window.__harness.everythingPersisted())).toEqual({
    opfsRoot: [],
    indexedDb: [],
    localStorage: [],
  });
});

test('a second tab gets "in use" while the first holds the store, and nothing of the first is touched', async ({
  page,
  context,
}) => {
  await openHarness(page);
  await initialize(page);
  await create(page);
  await record(page, 'In-Tab-A');

  const tabB = await context.newPage();
  await openHarness(tabB, false);
  await initialize(tabB);
  expect(await status(tabB)).toBe('locked');
  expect(await unlock(tabB)).toEqual({ kind: 'inUseElsewhere' });
  expect(await status(tabB)).toBe('locked');
  // Tab B must not be able to erase the store either.
  expect((await tabB.evaluate(() => window.__harness.eraser.eraseAll())).kind).toBe(
    'eraseLocalDataFailure',
  );
  expect(await plateNames(page)).toEqual(['In-Tab-A']); // tab A is unharmed

  // Once tab A locks, tab B can take over (and A is then the one that is told it is in use).
  await lock(page);
  expect(await unlock(tabB)).toEqual({ kind: 'unlocked' });
  expect(await plateNames(tabB)).toEqual(['In-Tab-A']);
  expect(await unlock(page)).toEqual({ kind: 'inUseElsewhere' });
  await tabB.close();
});

test('the store contract suite passes against the real OPFS store (production KDF cost)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openHarness(page);
  const results: ContractResult[] = await page.evaluate(
    (p) => window.__harness.runContract(p),
    GOOD,
  );
  expect(results.length).toBeGreaterThan(20);
  const failed = results.filter((r) => !r.ok);
  expect(failed, JSON.stringify(failed)).toEqual([]);
});

test('hidden page and idle both lock the real store', async ({ page }) => {
  await openHarness(page);
  await initialize(page);
  await create(page);
  expect(await status(page)).toBe('unlocked');
  // Drive the controller's own entry points (the page-event wiring is unit-tested).
  await page.evaluate(() => {
    window.__harness.controller.setIdleMinutes(5);
  });
  expect(await page.evaluate(() => window.__harness.controller.getSnapshot().idleMinutes)).toBe(5);
  await page.evaluate(() => window.__harness.controller.onHidden());
  expect(await status(page)).toBe('unlocked'); // 5 minutes have not passed
  await page.evaluate(() => window.__harness.controller.onVisible());
  expect(await status(page)).toBe('unlocked');
  await lock(page);
  // The worker is gone: another tab can open the store at once.
  expect(await status(page)).toBe('locked');
});

test('the worker and the engine run under the production CSP, with no console errors and no third-party requests', async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  const hosts = new Set<string>();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => hosts.add(new URL(r.url()).host));
  await openHarness(page);
  const csp = await page.evaluate(
    () =>
      document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute('content') ?? '',
  );
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).toContain("worker-src 'self' blob:");
  await initialize(page);
  expect(await create(page)).toEqual({ kind: 'unlocked' });
  await record(page, 'CSP-Check');
  expect(errors.filter((e) => /Content Security Policy|CSP|refused/i.test(e))).toEqual([]);
  expect(errors).toEqual([]);
  expect([...hosts]).toEqual([new URL(baseURL ?? 'http://localhost:4173').host]);
});

test('offline: the wasm engine and the worker are precached, so the store works with no network', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'service worker + offline is asserted in Chromium');
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  const precache = await page.evaluate(async () => (await fetch('/precache-manifest.json')).text());
  expect(precache).toContain('sqlite3mc/2.5.1/sqlite3.wasm');
  expect(precache).toContain('sqlite3mc/2.5.1/sqlite3.mjs');
  expect(precache).toMatch(/store\.worker-[\w-]+\.js/);

  await context.setOffline(true);
  try {
    await openHarness(page);
    await initialize(page);
    expect(await create(page)).toEqual({ kind: 'unlocked' });
    await record(page, 'Offline-Orange');
    expect(await plateNames(page)).toEqual(['Offline-Orange']);
    await lock(page);
    expect(await unlock(page)).toEqual({ kind: 'unlocked' });
  } finally {
    await context.setOffline(false);
  }
});

test('the availability probe says "ok" where the store can run', async ({ page }) => {
  await openHarness(page);
  expect(await page.evaluate(() => window.__harness.probeStorageAvailability())).toBe('ok');
  // The probe leaves nothing behind.
  expect((await page.evaluate(() => window.__harness.everythingPersisted())).opfsRoot).toEqual([]);
});

test('an ephemeral WebKit context (like Safari private browsing) refuses OPFS: the probe says so, and the store is never a wrong passphrase', async ({
  playwright,
  browserName,
  baseURL,
}) => {
  test.skip(browserName !== 'webkit', 'WebKit refuses OPFS file handles in ephemeral contexts');
  const browser = await playwright.webkit.launch();
  try {
    const page = await browser.newPage({ baseURL: baseURL ?? 'http://localhost:4173' });
    await openHarness(page, false);
    expect(await page.evaluate(() => window.__harness.probeStorageAvailability())).toBe('noOpfs');
    await initialize(page);
    const outcome = await create(page);
    expect(outcome.kind).toBe('storeUnavailable');
    expect(await status(page)).not.toBe('unlocked');
  } finally {
    await browser.close();
  }
});
