// Logging again, on the REAL encrypted store: save a plate as a meal and log it back from the
// capture sheet, copy a plate to today, and find the saved meal after a lock and unlock. The clock
// is pinned to lunch time (the coach reads the meal slot from it, and "now" decides where a copy
// lands), the way french.spec.ts pins it.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './persistent';
import { createStore, freshStart, logSalmonByTypingIt, plates, unlockAfterReload } from './flows';

test('save a meal and log it again, copy a plate to today, and keep it across a lock', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const lunch = new Date();
  lunch.setHours(12, 30, 0, 0);
  await page.clock.setFixedTime(lunch);
  const errors = await freshStart(page);
  await createStore(page);
  await logSalmonByTypingIt(page);
  await expect(plates(page)).toHaveCount(1);

  // The plate's own page: save it as a meal.
  await plates(page)
    .first()
    .click({ position: { x: 12, y: 12 } });
  await expect(page.getByRole('button', { name: 'Save as a meal' })).toBeVisible();
  await page.getByRole('button', { name: 'Save as a meal' }).click();
  const save = page.getByRole('dialog', { name: 'Save as a meal' });
  await expect(save.getByLabel('Name')).toHaveValue('Salmon');
  await save.getByLabel('Name').fill('Fish lunch');
  await save.getByRole('button', { name: 'Save meal' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByText('Saved as “Fish lunch”.')).toBeVisible();

  // Log it again from the capture sheet: the saved meal lands as a second plate.
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: 'Log a plate' }).first().click();
  const capture = page.getByRole('dialog', { name: 'Log a plate' });
  await capture.getByRole('button', { name: 'Saved meals and recipes' }).click();
  const saved = page.getByRole('dialog', { name: 'Saved meals and recipes' });
  await expect(saved.getByRole('button', { name: /Fish lunch/ })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);
  await saved.getByRole('button', { name: /Fish lunch/ }).click();
  await page
    .getByRole('dialog', { name: 'Log “Fish lunch”' })
    .getByRole('button', { name: 'Log this meal' })
    .click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(plates(page)).toHaveCount(2);

  // Copy a plate to today: a third plate, with the notice.
  await plates(page)
    .first()
    .click({ position: { x: 12, y: 12 } });
  await page.getByRole('button', { name: 'Log this again' }).click();
  const again = page.getByRole('dialog', { name: 'Log this again' });
  await expect(again.getByRole('radio', { name: 'Today' })).toBeChecked();
  await expect(again.getByRole('radio', { name: 'Lunch' })).toBeChecked();
  await again.getByRole('button', { name: 'Log this plate' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(page.getByText('Logged again: Lunch.')).toBeVisible();
  await expect(plates(page)).toHaveCount(3);

  // After a reload and an unlock the saved meal is still there, in Settings.
  await page.reload();
  await unlockAfterReload(page);
  await expect(plates(page)).toHaveCount(3);
  await page.evaluate(() => {
    window.location.hash = '#/settings/saved';
  });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Saved meals and recipes' }),
  ).toBeVisible();
  await expect(page.getByText('Fish lunch')).toBeVisible();
  const settingsAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(settingsAxe.violations).toEqual([]);

  expect(errors).toEqual([]);
});
