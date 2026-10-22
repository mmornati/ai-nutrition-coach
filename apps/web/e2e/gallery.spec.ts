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

/** The day-enter fade/slide must be over, or contrast is measured on a half-faded frame. */
async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState === 'finished' || a.effect?.getTiming().iterations === Infinity),
  );
}

test('the gallery has zero axe violations', async ({ page }) => {
  const errors = await openGallery(page);
  await settleAnimations(page);
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
  await settleAnimations(page);
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
    await settleAnimations(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations, name).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  }
});

test('keyboard: Tab reaches the opener, the capture sheet buttons are in order, Esc returns focus', async ({
  page,
  browserName,
}) => {
  // macOS WebKit does not Tab to buttons by default; Alt+Tab does (Playwright's documented way).
  const tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  const shiftTab = browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab';
  await openGallery(page);
  const opener = page.getByRole('button', { name: 'Open capture sheet' });

  // Reach the opener with Tab alone.
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press(tab);
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
  await page.keyboard.press(tab);
  expect(await active()).toMatch(/^Barcode/);
  await page.keyboard.press(tab);
  expect(await active()).toMatch(/^Type it/);
  await page.keyboard.press(shiftTab);
  await page.keyboard.press(shiftTab);
  expect(await active()).toMatch(/^Snapshot/);
  await page.keyboard.press(shiftTab);
  expect(await active()).toBe('Close');

  // Focus is trapped inside the dialog and visible (the ink 3px outline).
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

for (const width of [390, 1440]) {
  test(`200% text at ${width}px: no overflow, no overlapping week labels`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openGallery(page);
    // CSSOM, not a <style> tag: the release CSP forbids inline styles.
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      type Box = { l: number; t: number; r: number; b: number };
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const box = (el: Element): Box => {
        const r = el.getBoundingClientRect();
        return { l: r.left, t: r.top, r: r.right, b: r.bottom };
      };
      const hit = (a: Box, b: Box) =>
        a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
      /** Names of every pair of boxes that intersect. */
      const collisions = (name: string, boxes: Box[]) => {
        const out: string[] = [];
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++)
            if (hit(boxes[i]!, boxes[j]!)) out.push(`${name} ${i} x ${j}`);
        return out;
      };
      const group = (sel: string) => [...document.querySelectorAll(sel)].filter(visible).map(box);
      const route = group('[data-route-label]');
      const headers = group('[data-week-day-header]');
      const names = group('[data-line-name]');
      const stops = [...document.querySelectorAll('[role="img"] svg [data-week-towel] > rect')].map(
        box,
      );
      const nameVsStop = names.flatMap((n, i) =>
        stops.some((s) => hit(n, s)) ? [`group name ${i} x towel`] : [],
      );
      return {
        counts: { route: route.length, headers: headers.length, names: names.length },
        collisions: [
          ...collisions('route label', route),
          ...collisions('day header', headers),
          ...collisions('group name', names),
          ...nameVsStop,
        ],
        scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
        innerWidth: window.innerWidth,
        rootPx: getComputedStyle(document.documentElement).fontSize,
        offenders: [...document.body.querySelectorAll('*')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5)
          .slice(0, 12)
          .map(
            (el) =>
              `${Math.round(el.getBoundingClientRect().left)}-${Math.round(el.getBoundingClientRect().right)} ${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').slice(0, 60)}`,
          ),
      };
    });
    expect(m.rootPx).toBe('32px');
    expect(m.counts).toEqual({ route: 7, headers: 7, names: 4 });
    expect(m.collisions).toEqual([]);
    expect(m.offenders).toEqual([]);
    expect(m.scrollWidth).toBeLessThanOrEqual(m.innerWidth);
  });
}

test('reduced motion: the day-enter fade still runs, with no movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGallery(page);
  const enter = page.locator('.day-enter').first();
  await expect(enter).toBeVisible();
  const a = await enter.evaluate((el) => {
    const s = getComputedStyle(el);
    return { name: s.animationName, duration: s.animationDuration };
  });
  expect(a).toEqual({ name: 'day-fade', duration: '0.2s' });
  // Everything else stays reduced.
  const other = await page.evaluate(() => {
    const el = document.querySelector('.weave-stripe, .weave-resolving, button');
    return el ? getComputedStyle(el).transitionDuration : '';
  });
  expect(other).toMatch(/^0\.00*1s$|^1e-05s$|^0s$/);
});
