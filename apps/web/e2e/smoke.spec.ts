import { expect, test } from '@playwright/test';

// A first run opens on the About notice (the passphrase screens come after it). An ephemeral
// context in WebKit (like Safari private browsing) has no OPFS, so the app says so instead:
// either way the shell rendered, which is what these tests are about. The journey spec covers the
// real screens in a persistent profile.
const FIRST_SCREEN = /^(About this app|Your store can't open right now)$/;

test('built app loads with the right title and no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page).toHaveTitle('AI Nutrition Coach');
  await expect(page.getByRole('heading', { level: 1, name: FIRST_SCREEN })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the app shell still renders offline after the service worker is ready', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // A first-load SW installs but does not control the page until the next navigation.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: FIRST_SCREEN })).toBeVisible();
  await context.setOffline(false);
});
