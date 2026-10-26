// The encrypted backup on a relay, end to end on the REAL store, the real Argon2id worker and a REAL
// relay process (apps/relay, started by playwright.config.ts): create a vault on one device, restore
// it on a fresh one and find the same day board; join a device that has plates of its own and see the
// combined preview first; and an automatic push when the page is sent to the background. The app's
// same-origin /sync/ requests are routed to the relay (the preview server has none), and every request
// body is kept so the test can show that nothing readable ever left the page.
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, BrowserType, Page } from '@playwright/test';
import { expect, test } from './persistent';
import { createStore, freshStart, plates, PASSPHRASE, unlockAfterReload } from './flows';

// The port playwright.config.ts starts the relay on.
const RELAY_PORT = 4174;
test.use({ blockServiceWorkers: true });

const VAULT_PASSPHRASE = 'the vault passphrase 42';

interface Wire {
  readonly method: string;
  readonly path: string;
  readonly body: string;
  readonly status: number;
}

/** Sends the page's same-origin /sync/ requests to the real relay and keeps what was sent. */
async function routeToRelay(context: BrowserContext, wire: Wire[]): Promise<void> {
  await context.route('**/sync/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let response;
    try {
      // Chromium refuses a 304 handed back by a route (net::ERR_ABORTED), so conditional reads are
      // forwarded as plain reads; the 304 path itself is pinned by the relay tests and the smoke test.
      const headers = { ...request.headers() };
      delete headers['if-none-match'];
      response = await route.fetch({
        url: `http://127.0.0.1:${RELAY_PORT}${url.pathname}${url.search}`,
        headers,
      });
    } catch {
      await route.abort();
      return;
    }
    wire.push({
      method: request.method(),
      path: url.pathname,
      body: request.postData() ?? '',
      status: response.status(),
    });
    // The page may be going away (its context is closed at the end of a device's turn).
    await route.fulfill({ response }).catch(() => undefined);
  });
}

/** Another device: its own browser profile, routed to the same relay. Used one after the other. */
async function anotherDevice(
  playwright: Record<'chromium' | 'firefox' | 'webkit', BrowserType>,
  browserName: 'chromium' | 'firefox' | 'webkit',
  baseURL: string,
  wire: Wire[],
): Promise<{ page: Page; close: () => Promise<void> }> {
  const profile = mkdtempSync(join(tmpdir(), 'anc-e2e-device-'));
  const context = await playwright[browserName].launchPersistentContext(profile, {
    baseURL,
    serviceWorkers: 'block',
  });
  await routeToRelay(context, wire);
  const page = context.pages()[0] ?? (await context.newPage());
  return {
    page,
    close: async () => {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

async function openYourData(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/settings/data';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Your data' })).toBeVisible();
}

const sectionOf = (page: Page, heading: string) =>
  page.locator('section', { has: page.getByRole('heading', { level: 2, name: heading }) });

async function logFood(page: Page, query: string, name: RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Log a plate' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Log a plate' });
  await sheet.getByRole('button', { name: /Type it/ }).click();
  const typeIt = page.getByRole('dialog', { name: 'Add a food' });
  await typeIt.getByLabel('Food search').fill(query);
  await typeIt.getByRole('button', { name }).first().click();
  await typeIt.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}

/** What the person sees: the plates of Today, the whole of Today, and the whole of the week. */
async function board(page: Page): Promise<{ plates: string[]; today: string; week: string }> {
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  const today = await page.locator('main').innerText();
  const platesNow = await plates(page).allInnerTexts();
  await page.evaluate(() => {
    window.location.hash = '#/week';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'This week' })).toBeVisible();
  const week = await page.locator('main').innerText();
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  return { plates: platesNow, today, week };
}

async function settledBoard(page: Page): Promise<Awaited<ReturnType<typeof board>>> {
  let last = await board(page);
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.waitForTimeout(500);
    const next = await board(page);
    if (JSON.stringify(next) === JSON.stringify(last)) return next;
    last = next;
  }
  return last;
}

/** A page sent to the background: what the browser does when the person switches away. */
async function sendToBackground(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** Creates a vault on a device that has two plates; returns its handle. */
async function createVault(page: Page, handle: string): Promise<void> {
  await openYourData(page);
  const section = sectionOf(page, 'Back up to this server');
  await section.getByLabel('Handle').fill(handle);
  await section.getByLabel('Passphrase for this copy').fill(VAULT_PASSPHRASE);
  await section.getByLabel('Confirm passphrase').fill(VAULT_PASSPHRASE);
  await section.getByRole('button', { name: 'Back up to this server' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Backup on this server' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(`This device backs up to this server as ${handle}.`)).toBeVisible();
}

const handleFor = (label: string): string => `e2e-${label}-${randomBytes(4).toString('hex')}`;

test('a server without a relay shows nothing about sync', async ({ page }) => {
  const errors = await freshStart(page);
  await createStore(page);
  await openYourData(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Encrypted backup' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Back up to this server' })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('heading', { level: 2, name: 'Connect to this server’s copy' }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('create a vault, back up automatically, restore on a fresh device: the same day board', async ({
  page,
  context,
  playwright,
  browserName,
  baseURL,
}) => {
  test.setTimeout(300_000);
  const wire: Wire[] = [];
  await routeToRelay(context, wire);
  const offOrigin: string[] = [];
  page.on('request', (request) => {
    if (!/^(?:https?:\/\/localhost:4173\/|blob:|data:)/.test(request.url()))
      offOrigin.push(request.url());
  });
  const handle = handleFor('restore');

  const errors = await freshStart(page);
  await createStore(page);
  await logFood(page, 'appl', /^Apple/);
  await createVault(page, handle);
  // The first push is the signup itself: a vault at version 1.
  expect(wire.filter((w) => w.method === 'POST' && w.path === '/sync/v1/signup')).toHaveLength(1);

  // Changes after that go by themselves: here, when the page is sent to the background.
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  const putsBefore = wire.filter((w) => w.method === 'PUT').length;
  await logFood(page, 'salm', /^Salmon, Protein/);
  await expect(plates(page)).toHaveCount(2);
  await sendToBackground(page);
  await expect
    .poll(() => wire.filter((w) => w.method === 'PUT' && w.status === 200).length, {
      timeout: 60_000,
    })
    .toBe(putsBefore + 1);
  // Every write was conditional.
  await openYourData(page);
  await expect(page.getByText(/Everything on this device is backed up/)).toBeVisible();

  // The relay saw sealed envelopes and proofs, nothing readable.
  const everything = wire.map((w) => w.body).join('\n');
  for (const secret of ['Salmon', 'Apple', PASSPHRASE, VAULT_PASSPHRASE]) {
    expect(everything).not.toContain(secret);
  }
  expect(
    wire.filter((w) => w.method === 'PUT').every((w) => w.body.startsWith('{"envelope":{"v":1,')),
  ).toBe(true);

  // A reload from Today, so the baseline holds what is stored, not the live notice of the last log.
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await page.reload();
  await unlockAfterReload(page);
  await expect(plates(page)).toHaveCount(2);
  const before = await settledBoard(page);
  expect(before.plates).toHaveLength(2);
  expect(before.today).toContain('Salmon');
  await context.close();

  // A fresh device (nothing in its storage): restore from this server.
  const device = await anotherDevice(
    playwright,
    browserName,
    baseURL ?? 'http://localhost:4173',
    wire,
  );
  const second = device.page;
  const errors2 = await freshStart(second);
  await expect(second.getByRole('heading', { level: 1, name: 'About this app' })).toBeVisible();
  await second.getByRole('button', { name: 'Got it' }).click();
  await second.getByRole('button', { name: 'Restore from this server' }).click();
  await expect(
    second.getByRole('heading', { level: 1, name: 'Restore from this server' }),
  ).toBeVisible();
  // A wrong passphrase and an unknown handle are the same, calm line; nothing is created.
  await second.getByLabel('Handle').fill(handle);
  await second.getByLabel('Passphrase of the copy').fill('definitely the wrong one');
  await second.getByRole('button', { name: 'Find my copy' }).click();
  const none = 'Nothing on this server matches this handle and passphrase.';
  await expect(second.getByText(none)).toBeVisible({ timeout: 60_000 });
  await second.getByLabel('Handle').fill('nobody-here');
  await second.getByLabel('Passphrase of the copy').fill(VAULT_PASSPHRASE);
  await second.getByRole('button', { name: 'Find my copy' }).click();
  await expect(second.getByText(none)).toBeVisible({ timeout: 60_000 });
  expect(await second.evaluate(() => localStorage.getItem('anc.pwa.store.meta'))).toBeNull();

  await second.getByLabel('Handle').fill(handle);
  await second.getByLabel('Passphrase of the copy').fill(VAULT_PASSPHRASE);
  await second.getByRole('button', { name: 'Find my copy' }).click();
  await expect(second.getByText(/^Found your data: 2 plates, from .+ to today\.$/)).toBeVisible({
    timeout: 60_000,
  });
  await second.getByRole('button', { name: 'Restore and unlock' }).click();
  await expect(second.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(plates(second)).toHaveCount(2);
  await expect.poll(() => board(second), { timeout: 20_000 }).toEqual(before);

  // It is a real store with the vault's passphrase, and it is connected to the vault.
  await second.reload();
  await expect(second.getByRole('heading', { level: 1, name: 'Unlock your store' })).toBeVisible();
  await second.getByLabel('Passphrase', { exact: true }).fill(VAULT_PASSPHRASE);
  await second.getByRole('button', { name: 'Unlock' }).click();
  await expect(second.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(() => board(second), { timeout: 20_000 }).toEqual(before);
  await openYourData(second);
  await expect(second.getByText(`This device backs up to this server as ${handle}.`)).toBeVisible();
  expect(offOrigin).toEqual([]);
  expect(errors).toEqual([]);
  expect(errors2).toEqual([]);
  await device.close();
});

test('join a device that has plates of its own: the combined preview first, then Combine', async ({
  page,
  context,
  playwright,
  browserName,
  baseURL,
}) => {
  test.setTimeout(300_000);
  const wire: Wire[] = [];
  await routeToRelay(context, wire);
  const handle = handleFor('join');

  // Device one makes the vault with one plate.
  const errors = await freshStart(page);
  await createStore(page);
  await logFood(page, 'salm', /^Salmon, Protein/);
  await createVault(page, handle);
  await context.close();

  // Device two has a plate of its own and joins.
  const device = await anotherDevice(
    playwright,
    browserName,
    baseURL ?? 'http://localhost:4173',
    wire,
  );
  const second = device.page;
  const errors2 = await freshStart(second);
  await createStore(second);
  await logFood(second, 'appl', /^Apple/);
  await openYourData(second);
  const join = sectionOf(second, 'Connect to this server’s copy');
  await join.getByLabel('Handle').fill(handle);
  await join.getByLabel('Passphrase of the copy').fill(VAULT_PASSPHRASE);
  await join.getByRole('button', { name: 'Find my copy' }).click();
  await expect(second.getByRole('heading', { level: 3, name: 'Found your copy' })).toBeVisible({
    timeout: 60_000,
  });
  // The dry run: counts, and nothing has been written yet.
  await expect(second.getByText('On this server: 1 plate')).toBeVisible();
  await expect(second.getByText('On this device: 1 plate')).toBeVisible();
  await expect(second.getByText('Together: 2 plates')).toBeVisible();
  expect(wire.some((w) => w.method === 'PUT')).toBe(false);
  await expect(
    second.getByRole('heading', { level: 2, name: 'Backup on this server' }),
  ).toHaveCount(0);

  await second.getByRole('button', { name: 'Combine' }).click();
  await expect(
    second.getByText('Done. This device and the copy are combined, and the copy is up to date.'),
  ).toBeVisible({ timeout: 60_000 });
  // The combined result was pushed on top of the copy, as a conditional write.
  expect(wire.filter((w) => w.method === 'PUT' && w.status === 200)).toHaveLength(1);
  await second.evaluate(() => {
    window.location.hash = '#/';
  });
  await second.reload();
  await unlockAfterReload(second);
  await expect(plates(second)).toHaveCount(2);
  const together = await settledBoard(second);
  expect(together.today).toContain('Salmon');
  expect(together.today).toContain('Apple');
  await device.close();

  // A third device restores and finds both: the push really reached the relay.
  const third = await anotherDevice(
    playwright,
    browserName,
    baseURL ?? 'http://localhost:4173',
    wire,
  );
  const errors3 = await freshStart(third.page);
  await third.page.getByRole('button', { name: 'Got it' }).click();
  await third.page.getByRole('button', { name: 'Restore from this server' }).click();
  await third.page.getByLabel('Handle').fill(handle);
  await third.page.getByLabel('Passphrase of the copy').fill(VAULT_PASSPHRASE);
  await third.page.getByRole('button', { name: 'Find my copy' }).click();
  await expect(third.page.getByText(/^Found your data: 2 plates/)).toBeVisible({ timeout: 60_000 });
  await third.page.getByRole('button', { name: 'Restore and unlock' }).click();
  await expect(third.page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(plates(third.page)).toHaveCount(2);
  expect(await settledBoard(third.page)).toEqual(together);
  await third.close();

  const everything = wire.map((w) => w.body).join('\n');
  for (const secret of ['Salmon', 'Apple', PASSPHRASE, VAULT_PASSPHRASE]) {
    expect(everything).not.toContain(secret);
  }
  expect(errors).toEqual([]);
  expect(errors2).toEqual([]);
  expect(errors3).toEqual([]);
});
