// The language choice on the REAL encrypted store: pick Français in Settings, reload -> the gate
// is already French (the plaintext hint; html[lang]), unlock -> still French (the stored
// preference), erase -> back to the browser's language and the hint is gone. The French
// catalogue does not exist yet, so this asserts on html[lang] and the hint, not on French copy.
import { expect, test } from './persistent';
import { createStore, freshStart, unlockAfterReload } from './flows';

const HINT_KEY = 'anc.pwa.locale';
const htmlLang = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.lang);

test('pick Français -> reload (gate) -> unlock -> erase -> back to the browser language', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors = await freshStart(page);
  await createStore(page);
  // Playwright's default browser language is en-US: "Match my device" is English.
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.evaluate(() => (window.location.hash = '#/settings/language'));
  await expect(page.getByRole('heading', { level: 1, name: 'Language' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Match my device' })).toBeChecked();
  await page.getByText('Français', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  expect(await page.evaluate((k) => localStorage.getItem(k), HINT_KEY)).toBe('fr');

  // Reload from Today (unlockAfterReload waits for it; the address would otherwise be kept).
  await page.evaluate(() => (window.location.hash = '#/'));
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

  // Reload: the gate screen (before any decryption) already carries the chosen language.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Unlock your store' })).toBeVisible();
  expect(await htmlLang(page)).toBe('fr');

  // Unlock: the stored preference is applied and still French.
  await unlockAfterReload(page);
  expect(await htmlLang(page)).toBe('fr');
  await page.evaluate(() => (window.location.hash = '#/settings/language'));
  await expect(page.getByRole('radio', { name: 'Français' })).toBeChecked();

  // Erase all local data: first run, the browser's language again, and no hint left behind.
  await page.evaluate(() => (window.location.hash = '#/settings/data'));
  await page.getByRole('button', { name: 'Erase all local data' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Erase everything on this device?' });
  await dialog.getByRole('button', { name: 'Erase' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'About this app' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate((k) => localStorage.getItem(k), HINT_KEY)).toBeNull();

  expect(errors).toEqual([]);
});
