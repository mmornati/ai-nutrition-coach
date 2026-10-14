// The language choice on the REAL encrypted store: pick Français in Settings, reload -> the gate
// is already French (the plaintext hint; html[lang]), unlock -> still French (the stored
// preference), erase -> back to the browser's language and the hint is gone.
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
  await expect(page.getByRole('heading', { level: 1, name: 'Langue' })).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), HINT_KEY)).toBe('fr');

  // Reload from Today (the address would otherwise be kept).
  await page.evaluate(() => (window.location.hash = '#/'));
  await expect(page.getByRole('heading', { level: 1, name: 'Aujourd’hui' })).toBeVisible();

  // Reload: the gate screen (before any decryption) already speaks the chosen language.
  await page.reload();
  const gate = page.getByRole('heading', { level: 1, name: 'Déverrouiller votre coffre' });
  await expect(gate).toBeVisible();
  expect(await htmlLang(page)).toBe('fr');

  // Unlock: the stored preference is applied and still French. (The reloaded page may still be
  // letting go of the tab lock for a moment: unlockAfterReload tries again.)
  await unlockAfterReload(page, {
    gate: 'Déverrouiller votre coffre',
    label: 'Phrase secrète',
    button: 'Déverrouiller',
    heading: 'Aujourd’hui',
  });
  expect(await htmlLang(page)).toBe('fr');
  await page.evaluate(() => (window.location.hash = '#/settings/language'));
  await expect(page.getByRole('radio', { name: 'Français' })).toBeChecked();

  // Erase all local data: first run, the browser's language again, and no hint left behind.
  await page.evaluate(() => (window.location.hash = '#/settings/data'));
  await page.getByRole('button', { name: 'Effacer toutes les données locales' }).click();
  const dialog = page.getByRole('alertdialog', { name: /^Tout effacer sur cet appareil/ });
  await dialog.getByRole('button', { name: 'Effacer', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'About this app' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await page.evaluate((k) => localStorage.getItem(k), HINT_KEY)).toBeNull();

  expect(errors).toEqual([]);
});
