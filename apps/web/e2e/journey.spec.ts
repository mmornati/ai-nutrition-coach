// The first journey on the REAL encrypted store (sqlite3mc in the OPFS worker, Web Locks, the
// production CSP), through the real screens: first run -> About -> create passphrase -> Today
// (empty) -> log a plate by Type it -> it is on the line map -> lock -> unlock -> still there.
// Port of apps/client/test/e2e/real_app_test.dart.
//
// The Settings half of the journey (part B): Your data (export), lock, Your AI (own key), Erase,
// and every settings screen at 390/1440 and 200% text with real-browser axe.
//
// Each test uses a fresh PERSISTENT browser context (see ./persistent.ts).
import AxeBuilder from '@axe-core/playwright';
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

/** The Settings board is one click from the rail (desktop) or the gear (phone). */
async function openSettingsRow(page: Page, row: RegExp, heading: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: row }).click();
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

test('the whole journey: create -> log -> export -> lock -> unlock -> own key -> erase -> first run', async ({
  page,
}) => {
  test.setTimeout(180_000);
  // A phone shares the file; a desktop test browser downloads it. Force the download path (before
  // the first page load, so every page of the test has it) so the test never opens a share sheet.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined });
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined });
  });
  const errors = await freshStart(page);
  const origin = new URL(page.url()).origin;
  const offOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
      offOrigin.push(request.url());
    }
  });

  // 1. First run, a plate by Type it.
  await createStore(page);
  await logSalmonByTypingIt(page);
  await expect(plates(page)).toHaveCount(1);

  // 2. Settings -> Your data -> export CSV.
  await openSettingsRow(page, /^Your data/, 'Your data');
  await expect(page.getByText(/Exports are plain, unencrypted files/)).toBeVisible();
  await expect(
    page.getByText(/Erasing your data cannot delete a file you have already downloaded or shared/),
  ).toBeVisible();
  await expect(page.getByText('Last export: never')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2}-ai-nutrition-coach\.csv$/);
  const file = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of file) chunks.push(chunk as Buffer);
  const rows = Buffer.concat(chunks).toString('utf8').trim().split('\n');
  expect(rows[0]).toMatch(/^id,logged_at_utc,entry_id,/);
  expect(rows).toHaveLength(2);
  expect(rows[1]).toContain('Salmon');
  await expect(page.getByText(/^exported:/)).toBeVisible();
  await expect(page.getByText(/^Last export: \d/)).toBeVisible();

  // 3. Lock (from this screen), unlock: the plate is still there on Today.
  await page.getByRole('button', { name: 'Lock' }).last().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Unlock your store' })).toBeVisible();
  await unlock(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(plates(page)).toHaveCount(1);

  // 4. Your AI: choose My own key, fill endpoint, model and key, save.
  const secret = 'sk-or-v1-SECRETMATERIAL-9f3a';
  await openSettingsRow(page, /^Your AI/, 'Your AI');
  await expect(page.getByText('Not available yet')).toHaveCount(2);
  await page.getByText('My own key', { exact: true }).click();
  await page.getByLabel('Endpoint').fill('https://api.example.com/v1');
  await page.getByLabel('Model', { exact: true }).fill('vision-1');
  const key = page.getByLabel('API key');
  await key.fill(secret);
  await expect(key).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expect(key).toHaveValue('');
  await expect(page.getByText('key saved • ends with ••••9f3a')).toBeVisible();
  expect(await page.content()).not.toContain('SECRETMATERIAL');
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('SECRETMATERIAL');
  // Nothing was sent anywhere just by saving.
  expect(offOrigin).toEqual([]);

  // 5. The Settings board shows the live rung.
  await page.getByRole('banner').getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText('your key — 1 model')).toBeVisible();

  // 6. Erase all local data (confirm): back to a first run, About notice included.
  await page.getByRole('button', { name: /^Your data/ }).click();
  await page.getByRole('button', { name: 'Erase all local data' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Erase everything on this device?' });
  await expect(dialog.getByRole('button', { name: 'Keep my data' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Erase' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'About this app' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Protect your history' })).toBeVisible();

  expect(offOrigin).toEqual([]);
  expect(errors).toEqual([]);
});

const SETTINGS_SCREENS = [
  ['#/settings', 'Settings'],
  ['#/settings/ai', 'Your AI'],
  ['#/settings/data', 'Your data'],
  ['#/settings/privacy', 'What this app stores and sends'],
  ['#/settings/install', 'Install on your phone'],
  ['#/settings/about', 'About'],
] as const;

async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState === 'finished' || a.effect?.getTiming().iterations === Infinity),
  );
}

test('every settings screen: no horizontal scroll at 390px and 1440px, nor at 200% text, and zero axe violations', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await freshStart(page);
  await createStore(page);

  const overflow = (): Promise<{ scroll: number; client: number }> =>
    page.evaluate(() => {
      const el = document.documentElement;
      return { scroll: el.scrollWidth, client: el.clientWidth };
    });

  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const percent of ['100%', '200%']) {
      await page.evaluate((size) => {
        // CSSOM, not a <style> tag: the release CSP forbids inline styles.
        document.documentElement.style.fontSize = size;
      }, percent);
      for (const [hash, heading] of SETTINGS_SCREENS) {
        await page.evaluate((h) => {
          window.location.hash = h;
        }, hash);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        if (hash === '#/settings/ai') {
          // The key form open is the tallest state.
          await page.getByText('My own key', { exact: true }).click();
          await expect(page.getByLabel('API key')).toBeVisible();
        }
        const o = await overflow();
        expect(o.scroll, `${heading} at ${width}px, ${percent} text`).toBeLessThanOrEqual(o.client);
      }
    }
  }

  // Real-browser axe (contrast, names, roles) on each screen, on a phone and on a desktop.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const [hash, heading] of SETTINGS_SCREENS) {
      await page.evaluate((h) => {
        window.location.hash = h;
      }, hash);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await settleAnimations(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations, `${heading} at ${width}px`).toEqual([]);
    }
  }

  // The privacy page also works before the unlock: lock, then open #/privacy.
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await page.getByRole('button', { name: 'Lock' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Unlock your store' })).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = '#/privacy';
  });
  await expect(
    page.getByRole('heading', { level: 1, name: 'What this app stores and sends' }),
  ).toBeVisible();
  await expect(page.getByRole('switch')).toHaveCount(0);
  const locked = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(locked.violations).toEqual([]);
});
