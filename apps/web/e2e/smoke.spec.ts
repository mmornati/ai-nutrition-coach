import { expect, test } from '@playwright/test';

test('built app loads with the right title and no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page).toHaveTitle('AI Nutrition Coach');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
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
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await context.setOffline(false);
});
