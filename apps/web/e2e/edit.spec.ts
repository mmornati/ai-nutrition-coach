// Editing a logged plate, on the REAL encrypted store: build a two-food plate with Type it (custom
// foods with known nutrition, so the totals are exact), log it for yesterday, then edit it (change
// a weight, remove a food, move it to today) and check the day totals follow. The clock is pinned
// to lunch time, the way relog.spec.ts pins it.
import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './persistent';
import { createStore, freshStart, plates } from './flows';

async function addCustomFood(
  typeIt: Locator,
  name: string,
  grams: string,
  kcal: string,
): Promise<void> {
  await typeIt.getByLabel('Food search').fill(name);
  // No match: the custom food form appears, with its own name field; the optional weight and
  // nutrition fold open.
  await typeIt.getByLabel('Custom food name').fill(name);
  await typeIt.getByText('Weight and nutrition (optional)').click();
  await typeIt.getByLabel('Weight eaten (g)').fill(grams);
  await typeIt.getByLabel('Energy (kcal)').fill(kcal);
}

const nutrition = (page: Page) => page.getByRole('list', { name: /Nutrient amounts/ });

test('log a two-food plate for yesterday, edit it (weight, remove a food, move to today) and the totals follow', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const lunch = new Date();
  lunch.setHours(12, 30, 0, 0);
  await page.clock.setFixedTime(lunch);
  // A phone: the week strip (the day choice) is in the header there.
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await freshStart(page);
  await createStore(page);

  // 1. Yesterday: choose it in the week strip, then log a plate with two foods for its dinner.
  await page
    .getByRole('navigation', { name: 'This week: choose a day' })
    .getByRole('button')
    .nth(5)
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Yesterday' })).toBeVisible();
  await page.getByRole('button', { name: 'Log a plate' }).first().click();
  const capture = page.getByRole('dialog', { name: 'Log a plate' });
  // The radios are visually hidden: a click on their label is the tap a person makes.
  await capture.getByText('Dinner', { exact: true }).click();
  await expect(capture.getByRole('radio', { name: 'Dinner' })).toBeChecked();
  await capture.getByRole('button', { name: /Type it/ }).click();
  const typeIt = page.getByRole('dialog', { name: 'Add a food' });
  // 200 g at 100 kcal / 100 g is 200 kcal; 100 g at 300 kcal / 100 g is 300 kcal.
  await addCustomFood(typeIt, 'Qzx stew', '200', '100');
  await typeIt.getByRole('button', { name: 'Add another food' }).click();
  await addCustomFood(typeIt, 'Qzy bun', '100', '300');
  await typeIt.getByRole('button', { name: 'Log plate' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Yesterday' })).toBeVisible();
  await expect(plates(page)).toHaveCount(1);
  await expect(nutrition(page).getByText('500 kcal')).toBeVisible();

  // 2. Edit it: stew to 100 g, remove the bun.
  await plates(page)
    .first()
    .click({ position: { x: 12, y: 12 } });
  await expect(page.getByRole('heading', { level: 1, name: 'Dinner' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit this plate' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit plate' });
  await edit.getByRole('button', { name: 'Change the amount of Qzx stew' }).click();
  await edit.getByLabel('Grams').fill('100');
  await edit.getByRole('button', { name: 'Remove Qzy bun' }).click();
  // Focus stays in the sheet, on the row that is left.
  await expect(edit.getByRole('button', { name: 'Change the amount of Qzx stew' })).toBeFocused();
  // Move it to today: only the meals that have started are offered at 12:30.
  await edit.getByText('Today', { exact: true }).click();
  await expect(edit.getByRole('radio', { name: 'Today' })).toBeChecked();
  await expect(edit.getByRole('radio', { name: 'Dinner' })).toHaveCount(0);
  const axe = await new AxeBuilder({ page }).include('dialog[open]').analyze();
  expect(axe.violations).toEqual([]);
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByText('Plate updated.')).toBeVisible();

  // 3. The plate is on today now, with one food and the new total; yesterday is empty again.
  await expect(page.getByRole('button', { name: 'Edit this plate' })).toBeFocused();
  await expect(nutrition(page).getByText('100 kcal')).toBeVisible();
  await expect(page.getByText('Qzy bun')).toHaveCount(0);
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expect(plates(page)).toHaveCount(1);
  await expect(nutrition(page).getByText('100 kcal')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'This week: choose a day' })
    .getByRole('button')
    .nth(5)
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Yesterday' })).toBeVisible();
  await expect(plates(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: /nutrition/i })).toHaveCount(0);

  expect(errors).toEqual([]);
});
