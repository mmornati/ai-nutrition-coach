// Shared steps of the real-store journeys (journey.spec.ts, pwa.spec.ts).
import { type Page } from '@playwright/test';
import { expect } from './persistent';

export const PASSPHRASE = 'correct horse battery staple';

/**
 * Wipes OPFS, IndexedDB and localStorage first (some browsers keep OPFS beyond a throwaway
 * profile). It runs on a plain static file of the same origin, so the app is not running (and
 * holding the store's files) while it is wiped.
 */
export async function freshStart(page: Page, base = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/favicon.svg`);
  await page.evaluate(async () => {
    localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
      await root.removeEntry(name, { recursive: true });
    }
    // Wait for every delete to finish: a delete still pending when the app starts could land
    // after the app wrote its new header copy and take it away.
    for (const db of await indexedDB.databases()) {
      const name = db.name;
      if (!name) continue;
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    }
  });
  await page.goto(`${base}/`);
  return errors;
}

export async function createStore(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'About this app' })).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Protect your history' })).toBeVisible();
  await page.getByLabel('Passphrase', { exact: true }).fill(PASSPHRASE);
  await page.getByLabel('Confirm passphrase').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Create and unlock' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
    timeout: 30_000,
  });
}

export async function unlock(page: Page, passphrase = PASSPHRASE): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Unlock your store' })).toBeVisible();
  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Unlock' }).click();
}

/** The words of the lock screen and Today, for an unlock in another language (English default). */
export interface UnlockWords {
  /** The lock screen's heading. */
  readonly gate?: string;
  /** The passphrase field's label. */
  readonly label?: string;
  /** The unlock button's name. */
  readonly button?: string;
  /** Today's heading, the sign of a finished unlock. */
  readonly heading?: string;
}

/**
 * Unlock after a reload. The page that was reloaded may still be letting go of the tab lock for a
 * moment, in which case the screen says (calmly) that the app is open in another tab: try again.
 */
export async function unlockAfterReload(
  page: Page,
  {
    heading = 'Today',
    label = 'Passphrase',
    button = 'Unlock',
    gate = 'Unlock your store',
  }: UnlockWords = {},
): Promise<void> {
  const today = page.getByRole('heading', { level: 1, name: heading });
  for (let attempt = 0; attempt < 8; attempt++) {
    await expect(page.getByRole('heading', { level: 1, name: gate })).toBeVisible();
    await page.getByLabel(label, { exact: true }).fill(PASSPHRASE);
    await page.getByRole('button', { name: button, exact: button !== 'Unlock' }).click();
    try {
      await expect(today).toBeVisible({ timeout: 8_000 });
      return;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  await expect(today).toBeVisible();
}

export const plates = (page: Page) => page.locator('[data-testid^="open-plate-"]');

export async function logSalmonByTypingIt(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Log a plate' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Log a plate' });
  await sheet.getByRole('button', { name: /Type it/ }).click();
  const typeIt = page.getByRole('dialog', { name: 'Add a food' });
  await typeIt.getByLabel('Food search').fill('salm');
  await typeIt.getByRole('button', { name: /^Salmon, Protein/ }).click();
  await typeIt.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}
