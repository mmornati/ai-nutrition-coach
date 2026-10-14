import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openGallery(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/gallery');
  await expect(page.getByRole('heading', { level: 1, name: 'Gallery' })).toBeVisible();
  return errors;
}

test('the gallery has zero axe violations', async ({ page }) => {
  const errors = await openGallery(page);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('the gallery has zero axe violations with the capture sheet open', async ({ page }) => {
  await openGallery(page);
  await page.getByRole('button', { name: 'Open capture sheet' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log a plate' });
  await expect(dialog).toBeVisible();
  // Let the slide-up finish so contrast is measured on the settled sheet.
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test('the gallery has zero axe violations in every dialog and sheet', async ({ page }) => {
  await openGallery(page);
  const openers = [
    'Open barcode match',
    'Open recognized match',
    'Open photo consent',
    'Open lookup notice',
    'Open erase dialog',
    'Open remove plate',
  ];
  for (const name of openers) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations, name).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  }
});

test('keyboard: Tab reaches the opener, the capture sheet buttons are in order, Esc returns focus', async ({
  page,
}) => {
  await openGallery(page);
  const opener = page.getByRole('button', { name: 'Open capture sheet' });

  // Reach the opener with Tab alone.
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await opener.evaluate((el) => el === document.activeElement);
  }
  expect(reached).toBe(true);
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Log a plate' });
  await expect(dialog).toBeVisible();
  const active = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      return el ? (el.getAttribute('aria-label') ?? el.textContent ?? '').trim() : '';
    });

  // Opens on Snapshot; Tab walks Barcode then Type it. Shift+Tab goes back through Snapshot to
  // Close, which comes first in the DOM (title row) and so first in the tab order.
  expect(await active()).toMatch(/^Snapshot/);
  await page.keyboard.press('Tab');
  expect(await active()).toMatch(/^Barcode/);
  await page.keyboard.press('Tab');
  expect(await active()).toMatch(/^Type it/);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  expect(await active()).toMatch(/^Snapshot/);
  await page.keyboard.press('Shift+Tab');
  expect(await active()).toBe('Close');

  // Focus is trapped inside the dialog and visible (the amber 3px outline).
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(outline).toEqual({ width: '3px', style: 'solid' });

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('choosing Snapshot closes the sheet and reports the choice', async ({ page }) => {
  await openGallery(page);
  await page.getByRole('button', { name: 'Open capture sheet' }).click();
  await page.getByRole('button', { name: /^Snapshot/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Snapshot chosen')).toBeVisible();
});
