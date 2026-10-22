// The app in French on a narrow phone (320 px), on the REAL encrypted store: French runs 15–25 %
// longer than English, so the dock, the chips, the settings list, the meal labels and the
// sheet buttons are measured for horizontal overflow, the French copy is checked on screen, and
// real-browser axe runs on every screen. The language is set the way a person sets it: Settings,
// Language, Français.
import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';
import { expect, test } from './persistent';
import { createStore, freshStart, logSalmonByTypingIt, plates, unlockAfterReload } from './flows';
import { undersizedTargets } from './targets';

const NARROW = { width: 320, height: 700 } as const;
const WIDE = { width: 375, height: 700 } as const;

/**
 * Elements that stick out past the viewport, or whose content is wider than their own box and
 * is clipped. Visually hidden (sr-only) boxes, `aria-hidden` decoration and boxes that scroll on
 * purpose are left out. Returns one line per offender.
 */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${(el.textContent ?? '').trim().slice(0, 40)}"`;
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      if (el.closest('[aria-hidden="true"], .sr-only, dialog:not([open])')) continue;
      // Inside a sideways scroller (the dock's week route below 336 px), children may sit past
      // the edge on purpose: the scroller itself is still measured, and dockFits checks the rest.
      if (el.parentElement?.closest('[data-scroll-x]')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > vw + 0.5 || rect.left < -0.5) {
        out.push(
          `${describe(el)} spans ${Math.round(rect.left)}..${Math.round(rect.right)} of ${vw}`,
        );
        continue;
      }
      const clips = ['hidden', 'clip'].includes(style.overflowX);
      if (clips && el.scrollWidth > el.clientWidth + 1) {
        out.push(`${describe(el)} clips ${el.scrollWidth} into ${el.clientWidth}`);
      }
    }
    return out;
  });
}

/**
 * The phone dock (selected by its test id, not its localised name) at a narrow width: seven stops of
 * at least 48 px need 336 px, so below that the week route scrolls inside the dock. The dock and
 * the route stay within the viewport, every stop keeps its 48 px, and the selected stop (today on
 * arrival) is wholly in view. At 336 px and wider nothing scrolls.
 */
async function dockFits(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const dock = document.querySelector<HTMLElement>('[data-testid="dock"]');
    const nav = dock?.querySelector<HTMLElement>('nav[data-scroll-x]');
    if (!dock || !nav) return ['no dock week route'];
    for (const [name, el] of [
      ['dock', dock],
      ['route', nav],
    ] as const) {
      const r = el.getBoundingClientRect();
      if (r.left < -0.5 || r.right > vw + 0.5)
        out.push(`${name} spans ${r.left}..${r.right} of ${vw}`);
    }
    const box = nav.getBoundingClientRect();
    const stops = Array.from(nav.querySelectorAll<HTMLElement>('button'));
    if (stops.length !== 7) out.push(`${stops.length} stops`);
    for (const b of stops) {
      if (b.getBoundingClientRect().width < 47.5) out.push(`${b.ariaLabel} is narrower than 48px`);
    }
    const current = nav.querySelector<HTMLElement>('[aria-current="true"]');
    const c = current?.getBoundingClientRect();
    if (!c || c.left < box.left - 0.5 || c.right > box.right + 0.5) {
      out.push(`selected stop ${current?.ariaLabel ?? '(none)'} is not wholly in view`);
    }
    const scrolls = nav.scrollWidth > nav.clientWidth + 1;
    if (scrolls !== vw < 336) out.push(`route scrolls: ${scrolls} at ${vw}px`);
    return out;
  });
}

async function noPageScroll(page: Page): Promise<{ scroll: number; client: number }> {
  return page.evaluate(() => {
    const el = document.documentElement;
    return { scroll: el.scrollWidth, client: el.clientWidth };
  });
}

async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState === 'finished' || a.effect?.getTiming().iterations === Infinity),
  );
}

async function checkScreen(page: Page, label: string) {
  await settleAnimations(page);
  const o = await noPageScroll(page);
  expect(o.scroll, `${label}: page scroll`).toBeLessThanOrEqual(o.client);
  expect(await overflowing(page), `${label}: overflowing elements`).toEqual([]);
  // A card that arrives late (a coach note read after the screen) fades in from transparent, and
  // axe would measure its contrast mid-fade: settle and measure again before calling it a fault.
  // Only a colour-contrast violation can be a mid-fade artefact: any other one fails at once.
  let violations: Array<{ id: string }> = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    await settleAnimations(page);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    violations = results.violations;
    if (violations.length === 0 || violations.some((v) => v.id !== 'color-contrast')) break;
    await page.waitForTimeout(500);
  }
  expect(violations, `${label}: axe`).toEqual([]);
}

const go = (page: Page, hash: string) =>
  page.evaluate((h) => {
    window.location.hash = h;
  }, hash);

const SCREENS = [
  ['#/', 'Aujourd’hui'],
  ['#/week', 'Cette semaine'],
  ['#/settings', 'Réglages'],
  ['#/settings/ai', 'Votre IA'],
  ['#/settings/data', 'Vos données'],
  ['#/settings/privacy', 'Ce que l’application stocke et envoie'],
  ['#/settings/language', 'Langue'],
  ['#/settings/install', 'Installer sur votre téléphone'],
  ['#/settings/about', 'À propos'],
] as const;

test('French at 320 px: no overflow, French copy, axe on every screen, sheets and the gate', async ({
  page,
}) => {
  test.setTimeout(240_000);
  // The coach reads the meal slot from the clock (no veg nudge at breakfast), so the plates below
  // are logged at lunch whatever time the run starts. The browser shares this host's time zone.
  const lunch = new Date();
  lunch.setHours(12, 30, 0, 0);
  await page.clock.setFixedTime(lunch);
  const errors = await freshStart(page);
  await createStore(page);
  await logSalmonByTypingIt(page);
  await expect(plates(page)).toHaveCount(1);

  // English first: the dock is not a French issue, so it is measured in both languages.
  await page.setViewportSize(NARROW);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await checkScreen(page, 'Today (English) at 320px');
  expect(await dockFits(page), 'dock (English) at 320px').toEqual([]);
  expect(await undersizedTargets(page), 'Today (English) targets at 320px').toEqual([]);
  await page.setViewportSize(WIDE);
  expect(await dockFits(page), 'dock (English) at 375px').toEqual([]);

  // Settings, Language, Français.
  await go(page, '#/settings/language');
  await page.getByText('Français', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { level: 1, name: 'Langue' })).toBeVisible();

  await page.setViewportSize(NARROW);
  for (const [hash, heading] of SCREENS) {
    await go(page, hash);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    if (hash === '#/settings/ai') {
      // The key form open is the tallest state.
      await page.getByText('Ma propre clé', { exact: true }).click();
      await expect(page.getByLabel('Clé d’API')).toBeVisible();
    }
    await checkScreen(page, `${heading} at 320px`);
    if (hash === '#/week') {
      // Day by day: the day's name ("AUJOURD’HUI") ends before its line bars start.
      const collisions = await page.evaluate(() =>
        Array.from(document.querySelectorAll('li > button[aria-current], li > button'))
          .map((row) => Array.from(row.children).filter((c) => !c.classList.contains('sr-only')))
          .filter((cells) => cells.length >= 3)
          .filter(([label, bars]) => {
            if (!label || !bars) return false;
            const range = document.createRange();
            range.selectNodeContents(label);
            return range.getBoundingClientRect().right > bars.getBoundingClientRect().left + 0.5;
          })
          .map(([label]) => label?.textContent ?? ''),
      );
      expect(collisions, 'week list: day name runs into its bars').toEqual([]);
    }
  }

  // Today: the meal band names the plate in French, and its chip and the dock fit.
  await go(page, '#/');
  await expect(page.getByRole('heading', { level: 1, name: 'Aujourd’hui' })).toBeVisible();
  await expect(plates(page).first()).toHaveAttribute('aria-label', /protéines dans l’assiette/);
  // The coach note was written while the app spoke English: it is shown in French now.
  await expect(page.getByRole('group', { name: 'Question du coach' })).toContainText('légumes');
  // The salmon was logged in English: its plate reads "Saumon" now (the ref is frozen, the name
  // follows the language), and no English food name is left on the screen.
  await expect(page.getByText('Saumon', { exact: true })).toBeVisible();
  await expect(page.getByText('Salmon')).toHaveCount(0);
  expect(await undersizedTargets(page), 'Today targets at 320px').toEqual([]);
  expect(await dockFits(page), 'dock at 320px').toEqual([]);
  // Another day selected: it is brought into view, and today peeks in at the far edge.
  await page.getByTestId('dock').locator('nav button').first().click();
  expect(await dockFits(page), 'dock at 320px, oldest day selected').toEqual([]);
  await page.setViewportSize(WIDE);
  expect(await dockFits(page), 'dock at 375px').toEqual([]);
  await page.setViewportSize(NARROW);
  await page.getByTestId('dock').locator('nav button').last().click();

  // The capture sheet and the Type it sheet.
  await page.getByRole('button', { name: 'Noter une assiette' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Noter une assiette' });
  await expect(sheet.getByRole('button', { name: /^Photo/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Code-barres/ })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Saisir/ })).toBeVisible();
  await checkScreen(page, 'capture sheet at 320px');
  expect(await undersizedTargets(page), 'capture sheet targets at 320px').toEqual([]);
  await sheet.getByRole('button', { name: /^Saisir/ }).click();
  const typeIt = page.getByRole('dialog', { name: 'Ajouter un aliment' });
  // The English name finds it too; the French one is what is shown.
  await typeIt.getByLabel('Recherche d’aliment').fill('salm');
  await expect(typeIt.getByRole('button', { name: /^Saumon, Protéines/ })).toBeVisible();
  await typeIt.getByLabel('Recherche d’aliment').fill('épinards');
  await typeIt.getByRole('button', { name: /^Épinards, Fruits & légumes/ }).click();
  await expect(typeIt.getByRole('button', { name: '~1–2 tasses' })).toBeVisible();
  await expect(page.getByText('Spinach')).toHaveCount(0);
  await checkScreen(page, 'type-it sheet at 320px');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  // The plate's own screen.
  // (Its top edge: the coach card under the meal covers the button's centre.)
  await plates(page)
    .first()
    .click({ position: { x: 12, y: 12 } });
  await expect(page.getByRole('button', { name: 'Retirer cette assiette' })).toBeVisible();
  // Name and portion are worded from the catalogue (salmon is logged as "~1 fist").
  const entry = page.getByRole('list', { name: 'Dans l’assiette' }).getByRole('listitem');
  await expect(entry).toContainText('Saumon');
  await expect(entry).toContainText('~1 poing');
  await expect(page.getByText('fist')).toHaveCount(0);
  // The coach card arrives once its note is read, then fades in: measure after it has settled.
  await expect(page.getByRole('group', { name: 'Question du coach' })).toBeVisible();
  await checkScreen(page, 'plate screen at 320px');

  // A plate logged in French: the quiet "+ log another plate" line speaks French. Checked right
  // after the log, because the line is gone five seconds later by design (QuickRepeat).
  await go(page, '#/');
  await page.getByRole('button', { name: 'Noter une assiette' }).first().click();
  await page
    .getByRole('dialog', { name: 'Noter une assiette' })
    .getByRole('button', { name: /^Saisir/ })
    .click();
  const typeItAgain = page.getByRole('dialog', { name: 'Ajouter un aliment' });
  await typeItAgain.getByLabel('Recherche d’aliment').fill('épinards');
  await typeItAgain.getByRole('button', { name: /^Épinards, Fruits & légumes/ }).click();
  await typeItAgain.getByRole('button', { name: 'Noter', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Noter une autre assiette' })).toBeVisible();
  await expect(page.getByText('+ noter une autre assiette')).toBeVisible();

  // Lock: the gate is French too, and fits.
  await go(page, '#/');
  await page.getByRole('button', { name: 'Verrouiller' }).first().click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Déverrouiller votre coffre' }),
  ).toBeVisible();
  await page.getByText('Phrase secrète oubliée').click();
  await checkScreen(page, 'unlock screen at 320px');
  await unlockAfterReload(page, {
    gate: 'Déverrouiller votre coffre',
    label: 'Phrase secrète',
    button: 'Déverrouiller',
    heading: 'Aujourd’hui',
  });

  expect(errors).toEqual([]);
});
