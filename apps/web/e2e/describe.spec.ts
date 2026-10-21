// Describe a meal with no AI, on the real encrypted store in a real browser under the production
// CSP: the words are matched with the food list ON THIS DEVICE (nothing is sent anywhere), the
// review sheet opens with the matches ticked, and one plate is logged. The clock is pinned to lunch
// time so the coach's meal slot, and so the screen, do not depend on when the run starts.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './persistent';
import { createStore, freshStart, plates } from './flows';

test('Describe with no AI matches the words on the device and logs one plate', async ({ page }) => {
  test.setTimeout(150_000);
  const lunch = new Date();
  lunch.setHours(12, 30, 0, 0);
  await page.clock.setFixedTime(lunch);
  const errors = await freshStart(page);
  await createStore(page);

  // Nothing about a described meal may leave the page: no AI, no transcription, no third party.
  const sent: string[] = [];
  page.on('request', (r) => {
    if (
      r.method() !== 'GET' ||
      /\/ai\/v1\/|chat\/completions|audio\/transcriptions/.test(r.url())
    ) {
      sent.push(`${r.method()} ${r.url()}`);
    }
  });

  await page.getByRole('button', { name: 'Log a plate' }).first().click();
  const capture = page.getByRole('dialog', { name: 'Log a plate' });
  await capture.getByRole('button', { name: /Describe/ }).click();

  const sheet = page.getByRole('dialog', { name: 'Describe a meal' });
  await expect(sheet).toBeVisible();
  // No AI: the sheet says so plainly, offers the way to set one up, and has no microphone button.
  await expect(sheet.getByText(/No AI is set up, so your words are matched/)).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Set up AI' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Talk' })).toHaveCount(0);
  await expect(sheet.getByText(/keyboard's microphone/)).toBeVisible();
  const axe = await new AxeBuilder({ page }).include('dialog[open]').analyze();
  expect(axe.violations).toEqual([]);

  await sheet.getByLabel('What did you eat?').fill('salmon and an apple');
  await sheet.getByRole('button', { name: 'Find these foods' }).click();

  const review = page.getByRole('dialog', { name: 'Found 2 foods in your words' });
  await expect(review).toBeVisible();
  await expect(review.getByRole('checkbox', { checked: true })).toHaveCount(2);
  await review.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  await expect(plates(page)).toHaveCount(1);
  // One plate with both foods on it.
  await expect(page.getByText('Salmon, Apple', { exact: true })).toBeVisible();

  expect(sent).toEqual([]);
  expect(errors).toEqual([]);
});
