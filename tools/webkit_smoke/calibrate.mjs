// Records where the interactive elements are, for smoke.mjs (docs/pwa.md).
//
// Why this exists: with Flutter's accessibility semantics switched on, text
// typed into a field in WebKit (Playwright's build) never reaches the app
// (the semantics <input> keeps the characters, Flutter's editing host gets none;
// Chromium is fine). Semantics are irreversible for a page load, so smoke.mjs
// drives TEXT ENTRY and every click that precedes it WITHOUT semantics, by
// coordinates, and turns semantics on only to READ the screen. The layout is
// deterministic (bundled fonts, fixed 420x1200 viewport), so the coordinates are
// recorded once here, from Chromium with semantics, and committed as coords.json.
//
//   BASE_URL=http://localhost:8080 node calibrate.mjs      # rewrites coords.json
//
// Re-run it (and review the diff) when a screen on the smoke path changes.

import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'en-US', timezoneId: 'Europe/Paris', viewport: { width: 420, height: 1200 } });
const page = await ctx.newPage();
const coords = { viewport: { width: 420, height: 1200 } };

const centre = async (name, locator) => {
  await locator.waitFor({ timeout: 60000 });
  const b = await locator.boundingBox();
  coords[name] = [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)];
  console.log(name, coords[name]);
  return locator;
};
const type = async (locator, text) => { await locator.click(); await page.keyboard.type(text); };

await page.goto(BASE + '/');
await page.waitForSelector('flt-semantics-placeholder', { state: 'attached', timeout: 90000 });
await page.evaluate(() => document.querySelector('flt-semantics-placeholder').click());
const pass = await centre('create.passphrase', page.getByLabel('Passphrase', { exact: true }));
const confirm = await centre('create.confirm', page.getByLabel('Confirm passphrase'));
const create = await centre('create.button', page.getByRole('button', { name: 'Create and unlock' }));
await type(pass, 'correct horse battery staple');
await type(confirm, 'correct horse battery staple');
await create.click();
const fab = await centre('board.capture', page.getByRole('button', { name: 'Open capture sheet' }));
await fab.click();
const typeOrTalk = await centre('sheet.typeOrTalk', page.getByRole('button', { name: 'Type or talk' }));
await typeOrTalk.click();
const search = await centre('manual.search', page.locator('input[aria-label="Food search"]:not([disabled])'));
await type(search, 'apple');
const apple = await centre('manual.apple', page.getByRole('button', { name: /^Apple/ }).first());
await apple.click();
const piece = await centre('manual.piece', page.getByRole('checkbox', { name: '~1 piece' }));
await piece.click();
const log = await centre('manual.log', page.getByRole('button', { name: 'Log', exact: true }));
await log.click();
await page.getByRole('button', { name: 'Open capture sheet' }).waitFor();
// The lock screen.
await page.reload();
await page.waitForSelector('flt-semantics-placeholder', { state: 'attached', timeout: 90000 });
await page.evaluate(() => document.querySelector('flt-semantics-placeholder').click());
await centre('lock.passphrase', page.getByLabel('Passphrase', { exact: true }));
await centre('lock.button', page.getByRole('button', { name: 'Unlock' }));
fs.writeFileSync(new URL('./coords.json', import.meta.url), JSON.stringify(coords, null, 2) + '\n');
await browser.close();
