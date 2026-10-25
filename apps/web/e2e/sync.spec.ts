// The encrypted backup on a relay, end to end on the REAL store, the real Argon2id worker and a REAL
// relay process (apps/relay, started by playwright.config.ts): create a vault on one device, restore
// it on a fresh one and find the same day board; join a device that has plates of its own and see the
// combined preview first; an automatic push when the page is sent to the background; and two devices
// live at once (phase S3): interleaved plates, a delete, a saved-meal conflict and a language change
// converge through pulls on focus, and the chip says synced only after the relay acknowledged. The app's
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
const VAULT_PASSPHRASE = 'the vault passphrase 42';

interface Wire {
  readonly method: string;
  readonly path: string;
  readonly body: string;
  readonly status: number;
}

/** While `gate` is set, a push waits for it before it reaches the relay (the answer is not "acknowledged" yet). */
interface PutHold {
  gate: Promise<void> | null;
}

/** Sends the page's same-origin /sync/ requests to the real relay and keeps what was sent. */
async function routeToRelay(context: BrowserContext, wire: Wire[], hold?: PutHold): Promise<void> {
  await context.route('**/sync/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'PUT' && hold?.gate) await hold.gate;
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
  hold?: PutHold,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const profile = mkdtempSync(join(tmpdir(), 'anc-e2e-device-'));
  const context = await playwright[browserName].launchPersistentContext(profile, { baseURL });
  await routeToRelay(context, wire, hold);
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

// ── two devices live at once ────────────────────────────────────────────────────────────────────

/** The person comes back to the page: the browser fires both of these. */
async function comeBack(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
}

/** The state of the header chip ("synced" only after the relay acknowledged). */
const headerChip = (page: Page) => page.locator('header [data-chip-state]').first();

async function restoreOnDevice(page: Page, handle: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'About this app' })).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.getByRole('button', { name: 'Restore from this server' }).click();
  await page.getByLabel('Handle').fill(handle);
  await page.getByLabel('Passphrase of the copy').fill(VAULT_PASSPHRASE);
  await page.getByRole('button', { name: 'Find my copy' }).click();
  await expect(page.getByText(/^Found your data: /)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Restore and unlock' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
    timeout: 60_000,
  });
}

/** The plate whose text names `food`, on Today. */
const plateWith = (page: Page, food: string) =>
  page.locator(`div:has(> p:has-text("${food}")) > [data-testid^="open-plate-"]`);

const acknowledged = (wire: Wire[]): number =>
  wire.filter((w) => w.method === 'PUT' && w.status === 200).length;

async function openToday(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('two devices at once: plates, a delete, a saved-meal conflict and the language converge; synced only after the relay acknowledged', async ({
  page,
  context,
  playwright,
  browserName,
  baseURL,
}) => {
  // WebKit's persistent contexts share one site-data store, so two devices cannot be live at the
  // same time there (the other sync tests take turns). The pull logic itself is engine-independent.
  test.skip(browserName !== 'chromium', 'two live devices need isolated profiles');
  test.setTimeout(600_000);
  const wireA: Wire[] = [];
  const wireB: Wire[] = [];
  const hold: PutHold = { gate: null };
  await routeToRelay(context, wireA, hold);
  const handle = handleFor('two');
  const origin = baseURL ?? 'http://localhost:4173';

  // Time moves on by hand for focus pulls (they are throttled to one per minute or so): both devices
  // share one offset from the real clock, so "who edited later" stays what the test did last.
  let skew = 0;
  const pages: Page[] = [];
  const advance = async (ms: number): Promise<void> => {
    skew += ms;
    for (const p of pages) await p.clock.setSystemTime(Date.now() + skew);
  };
  await page.clock.install();
  pages.push(page);

  // Device A makes the vault with one plate.
  const errorsA = await freshStart(page);
  await createStore(page);
  await logFood(page, 'appl', /^Apple/);
  await createVault(page, handle);
  await openToday(page);
  await expect(headerChip(page)).toHaveAttribute('data-chip-state', 'synced', { timeout: 30_000 });

  // Device B restores it: it starts out synced (it holds exactly what the relay handed over).
  const deviceB = await anotherDevice(playwright, browserName, origin, wireB);
  const b = deviceB.page;
  await b.clock.install();
  pages.push(b);
  const errorsB = await freshStart(b);
  await restoreOnDevice(b, handle);
  await expect(plates(b)).toHaveCount(1);
  await expect(headerChip(b)).toHaveAttribute('data-chip-state', 'synced', { timeout: 30_000 });

  // A logs a plate. Until the relay ACKNOWLEDGES a push that held it, it is pending, on the header
  // and on the plate: here the push is held on the wire and the chip does not move.
  await logFood(page, 'salm', /^Salmon, Protein/);
  await expect(plates(page)).toHaveCount(2);
  await expect(headerChip(page)).toHaveAttribute('data-chip-state', 'pending');
  await expect(
    plateWith(page, 'Salmon').locator('xpath=..').locator('[data-chip-state]'),
  ).toHaveAttribute('data-chip-state', 'pending');
  const sentBefore = acknowledged(wireA);
  let release!: () => void;
  hold.gate = new Promise<void>((resolve) => (release = resolve));
  await sendToBackground(page);
  await page.waitForTimeout(2_000);
  await expect(headerChip(page)).toHaveAttribute('data-chip-state', 'pending');
  expect(acknowledged(wireA)).toBe(sentBefore);
  hold.gate = null;
  release();
  await expect.poll(() => acknowledged(wireA), { timeout: 60_000 }).toBe(sentBefore + 1);
  await comeBack(page);
  await expect(headerChip(page)).toHaveAttribute('data-chip-state', 'synced', { timeout: 30_000 });
  await expect(page.locator('main [data-chip-state]:not([data-chip-state="synced"])')).toHaveCount(
    0,
  );

  // B logs a plate before it has seen A's. Its push first takes A's work in, then sends both.
  await logFood(b, 'rice', /^Rice/);
  await expect(headerChip(b)).toHaveAttribute('data-chip-state', 'pending');
  const sentB = acknowledged(wireB);
  await sendToBackground(b);
  await expect.poll(() => acknowledged(wireB), { timeout: 60_000 }).toBe(sentB + 1);
  await comeBack(b);
  // No reload: A's Salmon appeared on B by itself.
  await expect(plates(b)).toHaveCount(3);
  await expect(headerChip(b)).toHaveAttribute('data-chip-state', 'synced', { timeout: 30_000 });

  // A comes back to the page and takes B's plate.
  await advance(61_000);
  await comeBack(page);
  await expect(plates(page)).toHaveCount(3, { timeout: 30_000 });

  // B removes one of A's plates (the dialog says it goes from the other devices too).
  const removeThis = b.getByRole('button', { name: 'Remove this plate', exact: true });
  await expect(async () => {
    // A tap can land while a pulled copy is being drawn: tap again until the plate's page is open.
    await plateWith(b, 'Salmon').click({ position: { x: 12, y: 12 }, timeout: 5_000 });
    await expect(removeThis).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await removeThis.click();
  const confirm = b.getByRole('alertdialog', { name: 'Remove this plate?' });
  await expect(confirm.getByText('It will also be removed from your other devices.')).toBeVisible();
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await expect(plates(b)).toHaveCount(2);
  const sentB2 = acknowledged(wireB);
  await sendToBackground(b);
  await expect.poll(() => acknowledged(wireB), { timeout: 60_000 }).toBe(sentB2 + 1);
  await comeBack(b);
  await advance(61_000);
  await comeBack(page);
  await expect(plates(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(page.locator('main')).not.toContainText('Salmon');
  await expect(b.locator('main')).not.toContainText('Salmon');

  // A saved meal: A saves a plate, B receives it, both rename it, B (the later edit) wins on both.
  const saveAsMeal = page.getByRole('button', { name: 'Save as a meal' });
  await expect(async () => {
    await plateWith(page, 'Apple').click({ position: { x: 12, y: 12 }, timeout: 5_000 });
    await expect(saveAsMeal).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await saveAsMeal.click();
  const save = page.getByRole('dialog', { name: 'Save as a meal' });
  await save.getByLabel('Name').fill('Lunch');
  await save.getByRole('button', { name: 'Save meal' }).click();
  await expect(page.getByText('Saved as “Lunch”.')).toBeVisible();
  const sentA3 = acknowledged(wireA);
  await sendToBackground(page);
  await expect.poll(() => acknowledged(wireA), { timeout: 60_000 }).toBe(sentA3 + 1);
  await comeBack(page);
  await advance(61_000);
  await b.evaluate(() => {
    window.location.hash = '#/settings/saved';
  });
  await comeBack(b);
  await expect(b.getByRole('button', { name: 'Rename Lunch' })).toBeVisible({ timeout: 30_000 });

  const rename = async (p: Page, to: string): Promise<void> => {
    await p.evaluate(() => {
      window.location.hash = '#/settings/saved';
    });
    await p.getByRole('button', { name: /^Rename Lunch/ }).click();
    await p.getByLabel('New name').fill(to);
    await p.getByRole('button', { name: 'Save name' }).click();
    await expect(p.getByRole('button', { name: `Rename ${to}` })).toBeVisible();
  };
  await rename(page, 'Lunch A');
  await advance(2_000);
  await rename(b, 'Lunch B');
  const sentB3 = acknowledged(wireB);
  await sendToBackground(b);
  await expect.poll(() => acknowledged(wireB), { timeout: 60_000 }).toBe(sentB3 + 1);
  await comeBack(b);
  // A, still on the saved meals screen with its own unsent rename, sends and finds B's later name.
  await advance(61_000);
  await sendToBackground(page);
  await comeBack(page);
  await expect(page.getByRole('button', { name: 'Rename Lunch B' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole('button', { name: 'Rename Lunch A' })).toHaveCount(0);
  await expect(b.getByRole('button', { name: 'Rename Lunch B' })).toBeVisible();
  await expect(headerChip(page)).toHaveAttribute('data-chip-state', 'synced', { timeout: 60_000 });

  // Both devices show the identical day board and saved meals.
  const boardA = await settledBoard(page);
  const boardB = await settledBoard(b);
  expect(boardA.plates).toHaveLength(2);
  // The one-off notice line under the title ("Saved as ...", "Plate removed.") belongs to the
  // device where the person acted; everything else on the board is the data, and must be identical.
  const withoutNotice = (text: string): string =>
    text.replace(
      /^(Saved as .*|Plate removed\.|Renamed\.|Gardé sous .*|Assiette retirée\.|Renommé\.)\n+/gm,
      '',
    );
  expect({ ...boardB, today: withoutNotice(boardB.today) }).toEqual({
    ...boardA,
    today: withoutNotice(boardA.today),
  });
  const savedOf = async (p: Page): Promise<string> => {
    await p.evaluate(() => {
      window.location.hash = '#/settings/saved';
    });
    await expect(
      p.getByRole('heading', { level: 1, name: 'Saved meals and recipes' }),
    ).toBeVisible();
    return p.locator('main').innerText();
  };
  expect(await savedOf(b)).toEqual(await savedOf(page));

  // A changes the language; B turns French by itself, with no reload.
  await page.evaluate(() => {
    window.location.hash = '#/settings/language';
  });
  await page.getByText('Français', { exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Langue' })).toBeVisible();
  const sentA4 = acknowledged(wireA);
  await sendToBackground(page);
  await expect.poll(() => acknowledged(wireA), { timeout: 60_000 }).toBe(sentA4 + 1);
  await comeBack(page);
  await advance(61_000);
  await openToday(b);
  await comeBack(b);
  await expect(b.getByRole('heading', { level: 1, name: 'Aujourd’hui' })).toBeVisible({
    timeout: 30_000,
  });
  await openToday(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Aujourd’hui' })).toBeVisible();
  expect(withoutNotice(await b.locator('main').innerText())).toEqual(
    withoutNotice(await page.locator('main').innerText()),
  );
  await expect(headerChip(page)).toHaveAttribute('data-chip-state', 'synced', { timeout: 30_000 });
  await expect(headerChip(b)).toHaveAttribute('data-chip-state', 'synced', { timeout: 30_000 });
  await expect(headerChip(b)).toHaveText('Synchronisé');

  // Everything the relay saw was sealed: no food, no meal name, no passphrase.
  const everything = [...wireA, ...wireB].map((w) => w.body).join('\n');
  for (const secret of ['Salmon', 'Apple', 'Rice', 'Lunch', PASSPHRASE, VAULT_PASSPHRASE]) {
    expect(everything).not.toContain(secret);
  }
  expect(
    [...wireA, ...wireB]
      .filter((w) => w.method === 'PUT')
      .every((w) => w.body.startsWith('{"envelope":{"v":1,')),
  ).toBe(true);
  expect(errorsA).toEqual([]);
  expect(errorsB).toEqual([]);
  await deviceB.close();
});
