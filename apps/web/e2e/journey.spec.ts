// The first journey on the REAL encrypted store (sqlite3mc in the OPFS worker, Web Locks, the
// production CSP), through the real screens: first run -> About -> create passphrase -> Today
// (empty) -> log a plate by Type it -> it is on the line map -> lock -> unlock -> still there.
// Port of apps/client/test/e2e/real_app_test.dart.
//
// Each test uses a fresh PERSISTENT browser context (see ./persistent.ts).
import { type Page } from '@playwright/test';
import { expect, test } from './persistent';

const PASSPHRASE = 'correct horse battery staple';

/**
 * Wipes OPFS, IndexedDB and localStorage first (some browsers keep OPFS beyond a throwaway
 * profile). It runs on a plain static file of the same origin, so the app is not running (and
 * holding the store's files) while it is wiped.
 */
async function freshStart(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/favicon.svg');
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
  await page.goto('/');
  return errors;
}

async function createStore(page: Page): Promise<void> {
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

async function unlock(page: Page, passphrase = PASSPHRASE): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Unlock your store' })).toBeVisible();
  await page.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Unlock' }).click();
}

/**
 * Unlock after a reload. The page that was reloaded may still be letting go of the tab lock for a
 * moment, in which case the screen says (calmly) that the app is open in another tab: try again.
 */
async function unlockAfterReload(page: Page): Promise<void> {
  const today = page.getByRole('heading', { level: 1, name: 'Today' });
  for (let attempt = 0; attempt < 8; attempt++) {
    await unlock(page);
    try {
      await expect(today).toBeVisible({ timeout: 8_000 });
      return;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  await expect(today).toBeVisible();
}

const plates = (page: Page) => page.locator('[data-testid^="open-plate-"]');

async function logSalmonByTypingIt(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Log a plate' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Log a plate' });
  await sheet.getByRole('button', { name: /Type it/ }).click();
  const typeIt = page.getByRole('dialog', { name: 'Add a food' });
  await typeIt.getByLabel('Food search').fill('salm');
  await typeIt.getByRole('button', { name: /^Salmon, Protein/ }).click();
  await typeIt.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}

test('first run -> About -> create -> Today -> log by Type it -> lock -> unlock -> the plate is there', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = await freshStart(page);

  // 1. The About notice comes before any passphrase screen, and has one button.
  await expect(page.getByRole('heading', { level: 1, name: 'About this app' })).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(1);
  await createStore(page);

  // 2. Today is empty: three open stations, no plates.
  await expect(plates(page)).toHaveCount(0);
  for (const meal of ['Breakfast', 'Lunch', 'Dinner']) {
    await expect(page.getByRole('heading', { level: 2, name: meal })).toBeVisible();
  }

  // 3. Log a plate by typing it: it lands on the line map as a station.
  await logSalmonByTypingIt(page);
  await expect(plates(page)).toHaveCount(1);
  await expect(plates(page).first()).toHaveAttribute('aria-label', /protein stopped/);
  await expect(page.getByText('Salmon')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log another plate' })).toBeVisible();

  // 4. Lock: nothing decrypted is left on the page.
  await page.getByRole('button', { name: 'Lock' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Unlock your store' })).toBeVisible();
  await expect(page.getByText('Salmon')).toHaveCount(0);

  // 5. A wrong passphrase stays locked with one calm line; the right one brings the plate back.
  await unlock(page, 'wrong passphrase 12');
  await expect(page.getByText('That passphrase does not open this store.')).toBeVisible();
  await unlock(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(plates(page)).toHaveCount(1);
  await expect(page.getByText('Salmon')).toBeVisible();
  // The notice was kept in the encrypted store: it is not asked again.
  await expect(page.getByRole('heading', { name: 'About this app' })).toHaveCount(0);

  // 6. It survives a reload (the store is on disk, encrypted): unlock again.
  await page.reload();
  await unlockAfterReload(page);
  await expect(plates(page)).toHaveCount(1);

  expect(errors).toEqual([]);
});

test('Today and Week have no horizontal scroll at 390px and 1440px', async ({ page }) => {
  test.setTimeout(120_000);
  await freshStart(page);
  await createStore(page);
  await logSalmonByTypingIt(page);
  await expect(plates(page)).toHaveCount(1);

  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const [hash, heading] of [
      ['#/', 'Today'],
      ['#/week', 'This week'],
    ] as const) {
      await page.evaluate((h) => {
        window.location.hash = h;
      }, hash);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        return { scroll: el.scrollWidth, client: el.clientWidth };
      });
      expect(overflow.scroll, `${heading} at ${width}px`).toBeLessThanOrEqual(overflow.client);
    }
  }
});
