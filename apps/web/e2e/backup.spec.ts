// The encrypted backup on the REAL store, the real Argon2id worker and the real browser download:
// log plates, save an encrypted backup, erase everything, restore it from the create-passphrase
// screen and find the same day board; and the failures that must leave the device untouched (a
// wrong passphrase, a damaged file) with one calm line and no store created.
import { expect, test } from './persistent';
import {
  createStore,
  freshStart,
  logSalmonByTypingIt,
  PASSPHRASE,
  plates,
  unlockAfterReload,
} from './flows';
import type { Page } from '@playwright/test';

/** A titled group of Your data, found by its heading. */
const sectionOf = (page: Page, heading: string) =>
  page.locator('section', { has: page.getByRole('heading', { level: 2, name: heading }) });

/** Settings, Your data, by its address. */
async function openYourData(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/settings/data';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Your data' })).toBeVisible();
}

/** Saves an encrypted backup and returns the file the browser downloaded. */
async function saveBackup(
  page: Page,
  passphrase: string,
): Promise<{ name: string; bytes: Buffer }> {
  const section = sectionOf(page, 'Encrypted backup');
  await section.getByLabel('Backup passphrase', { exact: true }).fill(passphrase);
  await section.getByLabel('Confirm backup passphrase').fill(passphrase);
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await section.getByRole('button', { name: 'Save an encrypted backup' }).click();
  const file = await download;
  const chunks: Buffer[] = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer);
  return { name: file.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

async function eraseEverything(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Erase all local data' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Erase everything on this device?' });
  await dialog.getByRole('button', { name: 'Erase' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'About this app' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Protect your history' })).toBeVisible();
}

async function toRestoreScreen(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Restore from a backup' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Restore from a backup' }),
  ).toBeVisible();
}

/**
 * Both engines offer the Web Share sheet for a file (WebKit's resolves at once without saving
 * anything), so the share API is taken away to make the app use the plain download, which is the
 * path a test can observe. The share path is covered by web-export-destination.test.ts.
 */
async function withoutShareSheet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const name of ['share', 'canShare']) {
      Object.defineProperty(Navigator.prototype, name, { value: undefined, configurable: true });
    }
  });
}

/** Logs one food by typing a few letters of its name. */
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

/**
 * The board once it has stopped changing: the coach notes are read after the plates, so two reads
 * in a row must agree before the result is trusted.
 */
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

const hasStore = (page: Page): Promise<boolean> =>
  page.evaluate(() => localStorage.getItem('anc.pwa.store.meta') !== null);

test('log plates, save an encrypted backup, erase, restore it: the same day board', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const offOrigin: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!/^(?:https?:\/\/localhost:4173\/|blob:|data:)/.test(url)) offOrigin.push(url);
  });
  await withoutShareSheet(page);
  // Yesterday has a plate of its own, today has two different foods.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(12, 30, 0, 0);
  await page.clock.setFixedTime(yesterday);
  const errors = await freshStart(page);
  await createStore(page);
  await logFood(page, 'appl', /^Apple/);
  const lunch = new Date();
  lunch.setHours(12, 30, 0, 0);
  await page.clock.setFixedTime(lunch);
  await page.reload();
  await unlockAfterReload(page);
  await logSalmonByTypingIt(page);
  await logFood(page, 'appl', /^Apple/);
  await expect(plates(page)).toHaveCount(2);
  // A reload first, so the baseline holds what is stored, not the live notice of the last log.
  await page.reload();
  await unlockAfterReload(page);
  await expect(plates(page)).toHaveCount(2);
  const before = await settledBoard(page);
  expect(before.plates).toHaveLength(2);
  expect(before.today).toContain('Salmon');
  expect(before.week).toContain('2 days with meals logged');
  expect(before.week).toMatch(/\w+day: veg & fruit; no protein, starch and dairy/);

  await openYourData(page);
  // A passphrase that does not match is caught on the screen, before any work.
  const section = sectionOf(page, 'Encrypted backup');
  await section.getByLabel('Backup passphrase', { exact: true }).fill(PASSPHRASE);
  await section.getByLabel('Confirm backup passphrase').fill('something else entirely');
  await section.getByRole('button', { name: 'Save an encrypted backup' }).click();
  await expect(section.getByText("The two passphrases don't match.")).toBeVisible();

  const backup = await saveBackup(page, PASSPHRASE);
  expect(backup.name).toMatch(/^ai-nutrition-coach-\d{4}-\d{2}-\d{2}\.ancvault$/);
  await expect(section.getByText(backup.name)).toBeVisible();
  await expect(page.getByText(/^Last export: \d/)).toBeVisible();
  // The fields are emptied after the attempt, and the file reveals nothing.
  await expect(section.getByLabel('Backup passphrase', { exact: true })).toHaveValue('');
  const envelope = JSON.parse(backup.bytes.toString('utf8')) as Record<string, unknown>;
  expect(Object.keys(envelope)).toEqual([
    'v',
    'vaultId',
    'version',
    'alg',
    'kdf',
    'salt',
    'nonce',
    'ct',
  ]);
  expect(envelope['kdf']).toEqual({ name: 'argon2id', v: 19, m: 65536, t: 3, p: 1 });
  expect(backup.bytes.toString('utf8')).not.toContain('Salmon');

  await eraseEverything(page);
  expect(await hasStore(page)).toBe(false);

  // Restore: the backup's passphrase becomes this device's.
  await toRestoreScreen(page);
  await page.getByLabel('Backup file').setInputFiles({
    name: backup.name,
    mimeType: 'application/octet-stream',
    buffer: backup.bytes,
  });
  await page.getByLabel('Backup passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Restore and unlock' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(plates(page)).toHaveCount(2);
  await expect.poll(() => board(page), { timeout: 20_000 }).toEqual(before);

  // It is a real store with that passphrase: it survives a reload and unlocks with it.
  await page.reload();
  await unlockAfterReload(page);
  await expect(plates(page)).toHaveCount(2);
  await expect.poll(() => board(page), { timeout: 20_000 }).toEqual(before);

  // Restoring it again into the open store is a merge: nothing is duplicated.
  await openYourData(page);
  const restore = sectionOf(page, 'Restore from a backup');
  await restore.getByLabel('Backup file').setInputFiles({
    name: backup.name,
    mimeType: 'application/octet-stream',
    buffer: backup.bytes,
  });
  await restore.getByLabel('Backup passphrase').fill(PASSPHRASE);
  await restore.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText(/^Restored\./)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => board(page), { timeout: 20_000 }).toEqual(before);

  // Nothing left the page for another host, and the Argon2 worker raised no error.
  expect(offOrigin).toEqual([]);
  expect(errors).toEqual([]);
});

test('a wrong passphrase or a damaged file: one calm line, still on the create screen, no store', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await withoutShareSheet(page);
  const errors = await freshStart(page);
  await createStore(page);
  await logSalmonByTypingIt(page);
  await openYourData(page);
  const backup = await saveBackup(page, PASSPHRASE);
  await eraseEverything(page);
  expect(await hasStore(page)).toBe(false);

  const calm = 'Nothing was changed.';
  await toRestoreScreen(page);
  const file = (buffer: Buffer) => ({
    name: backup.name,
    mimeType: 'application/octet-stream',
    buffer,
  });

  // A wrong passphrase.
  await page.getByLabel('Backup file').setInputFiles(file(backup.bytes));
  await page.getByLabel('Backup passphrase').fill('definitely the wrong one');
  await page.getByRole('button', { name: 'Restore and unlock' }).click();
  await expect(
    page.getByText(
      'That passphrase does not open this file, or the file is damaged. Nothing was changed.',
    ),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Restore from a backup' }),
  ).toBeVisible();
  expect(await hasStore(page)).toBe(false);
  await expect(page.getByLabel('Backup passphrase')).toHaveValue('');

  // A damaged file (one byte of the ciphertext changed), with the RIGHT passphrase.
  const envelope = JSON.parse(backup.bytes.toString('utf8')) as { ct: string };
  const middle = Math.floor(envelope.ct.length / 2);
  envelope.ct =
    envelope.ct.slice(0, middle) +
    (envelope.ct[middle] === 'A' ? 'B' : 'A') +
    envelope.ct.slice(middle + 1);
  await page.getByLabel('Backup file').setInputFiles(file(Buffer.from(JSON.stringify(envelope))));
  await page.getByLabel('Backup passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Restore and unlock' }).click();
  await expect(page.getByText(/the file is damaged\. Nothing was changed\./)).toBeVisible({
    timeout: 60_000,
  });
  expect(await hasStore(page)).toBe(false);

  // Not a backup at all.
  await page.getByLabel('Backup file').setInputFiles({
    name: 'export.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('id,logged_at_utc\n1,2026-10-22\n'),
  });
  await page.getByLabel('Backup passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Restore and unlock' }).click();
  await expect(page.getByText(/does not look like an AI Nutrition Coach backup/)).toBeVisible();
  expect(await hasStore(page)).toBe(false);
  await expect(page.getByText(calm)).toBeVisible();

  // And the right file with the right passphrase still works after all those refusals.
  await page.getByLabel('Backup file').setInputFiles(file(backup.bytes));
  await page.getByLabel('Backup passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Restore and unlock' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(plates(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});
