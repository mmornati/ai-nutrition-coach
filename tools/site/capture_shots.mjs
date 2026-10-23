#!/usr/bin/env node
// Deterministic screenshots of the AI Nutrition Coach PWA for the docs site, the marketing pages and
// the videos. Real screens of the real release build (apps/web/dist, served with the container's headers and
// the production CSP), driven through the same UI flows as the e2e tests: first run, passphrase,
// plates logged by Describe and Type it, a barcode read by Chromium's fake camera. No AI key is used.
//
// The clock is pinned (Thursday 22 October 2026, Europe/Paris), the previous days are logged by
// moving the pinned clock back, and every shot waits for fonts and animations to settle.
//
// Run (after `pnpm build`):
//   pnpm --filter @anc/web exec node ../../tools/site/capture_shots.mjs
// Options (env): SHOTS_OUT (default docs/assets/shots), SHOTS_PORT (default 4181),
//   SHOTS_KEEP_PNG=1 keeps the intermediate PNGs next to the WebP files, SHOTS_QUALITY (85).
//
// Needs: the Playwright chromium (`pnpm --filter @anc/web exec playwright install chromium`) and
// cwebp (or ImageMagick's `magick`) on PATH.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const web = join(repo, 'apps/web');
const dist = join(web, 'dist');
const out = resolve(repo, process.env.SHOTS_OUT ?? 'docs/assets/shots');
const port = Number(process.env.SHOTS_PORT ?? 4181);
const quality = Number(process.env.SHOTS_QUALITY ?? 85);
const keepPng = process.env.SHOTS_KEEP_PNG === '1';
const origin = `http://localhost:${port}`;

const require = createRequire(join(web, 'package.json'));
const { chromium } = require('playwright-core');
const { ean13Y4m } = await import(join(web, 'src/barcode/ean13-fixture.ts'));

if (!existsSync(join(dist, 'index.html'))) {
  console.error('apps/web/dist is missing: run `pnpm build` first.');
  process.exit(1);
}

const PASSPHRASE = 'quiet towel morning tea';
const TZ = 'Europe/Paris';
/** A wall-clock time on a day of the demo week, as an absolute instant (Paris is UTC+2 then). */
const at = (day, hh, mm = 0) =>
  new Date(`2026-10-${String(day).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+02:00`);
const TODAY = 22; // Thursday 22 October 2026

// A valid EAN-13 the fake camera shows. Its Open Food Facts answer is a fixture served locally (the
// network is never used): a plain muesli with typical values per 100 g.
const BARCODE = '3760123456784';
const OFF_PRODUCT = {
  status: 1,
  product: {
    product_name: 'Crunchy oat muesli',
    product_name_en: 'Crunchy oat muesli',
    categories_tags: ['en:breakfasts', 'en:cereals-and-potatoes', 'en:breakfast-cereals', 'en:mueslis'],
    nutriments: {
      'energy-kcal_100g': 432,
      proteins_100g: 9.1,
      carbohydrates_100g: 62,
      sugars_100g: 16,
      fat_100g: 15,
      'saturated-fat_100g': 2.4,
      fiber_100g: 7.5,
      salt_100g: 0.1,
    },
    serving_quantity: 45,
    serving_quantity_unit: 'g',
    serving_size: '45 g',
    product_quantity: 500,
    product_quantity_unit: 'g',
  },
};

// ---------------------------------------------------------------------------------------------
// Server

// The release headers of the container (as apps/web/e2e/static-server.ts serves them): the full
// production CSP, no-cache for the worker and manifests, and the instance AI offer answered "off".
const { headerCsp } = await import(join(web, 'vite.config.ts'));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function startServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.includes('..')) path = '/index.html';
    const headers = {
      'content-security-policy': headerCsp({ dev: false }),
      'x-content-type-options': 'nosniff',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-resource-policy': 'same-origin',
    };
    if (path === '/ai/config.json') {
      res.writeHead(200, { ...headers, 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end('{"enabled":false}');
      return;
    }
    const file = join(dist, path);
    const isFile = existsSync(file) && statSync(file).isFile();
    const served = isFile ? path : extname(path) ? undefined : '/index.html';
    if (!served) {
      res.writeHead(404, headers).end('not found');
      return;
    }
    headers['content-type'] = TYPES[extname(served)] ?? 'application/octet-stream';
    if (['/index.html', '/sw.js', '/precache-manifest.json', '/manifest.webmanifest'].includes(served)) {
      headers['cache-control'] = 'no-cache';
    }
    res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : readFileSync(join(dist, served)));
  });
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, ok);
  });
  return { kill: () => server.close() };
}

// ---------------------------------------------------------------------------------------------
// Browser

const scratch = mkdtempSync(join(tmpdir(), 'anc-shots-'));
const profile = join(scratch, 'profile');
const pngDir = join(scratch, 'png');
mkdirSync(pngDir, { recursive: true });
const clip = join(scratch, `ean13-${BARCODE}.y4m`);
writeFileSync(clip, ean13Y4m(BARCODE));

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

async function openContext(device) {
  const context = await chromium.launchPersistentContext(profile, {
    ...device,
    baseURL: origin,
    locale: 'en-GB',
    timezoneId: TZ,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    permissions: ['camera'],
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${clip}`,
      '--hide-scrollbars',
    ],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`);
  });
  // Open Food Facts, answered locally: the release CSP allows the host, the network is not used.
  await page.route('https://world.openfoodfacts.org/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(OFF_PRODUCT),
    }),
  );
  // An installed app is granted durable storage; grant it here so the screens read as installed.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Browser.grantPermissions', { origin, permissions: ['durableStorage'] });
  // Never a phone share sheet: the export takes the download path.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined });
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined });
  });
  return { context, page, problems };
}

/** Fonts loaded, no running finite animation, two frames painted. */
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every((a) => a.playState === 'finished' || a.effect?.getTiming().iterations === Infinity),
    undefined,
    { timeout: 10_000 },
  ).catch(() => undefined);
  await page.waitForTimeout(350);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
}

const manifest = [];
async function shot(page, file, screen, caption, { fullPage = false } = {}) {
  // A whole page is taken with a viewport as tall as the page, so the fixed dock and Log button sit
  // at its bottom (a scrolled full-page capture would paint them halfway down).
  const before = page.viewportSize();
  if (fullPage) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: before.width, height: h });
    const h2 = await page.evaluate(() => document.documentElement.scrollHeight);
    if (h2 !== h) await page.setViewportSize({ width: before.width, height: h2 });
  }
  await settle(page);
  const png = join(pngDir, `${file}.png`);
  await page.screenshot({ path: png, animations: 'disabled', caret: 'hide' });
  const size = await page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio,
  }));
  if (fullPage) await page.setViewportSize(before);
  manifest.push({
    file: `${file}.webp`,
    w: Math.round(size.w * size.dpr),
    h: Math.round(size.h * size.dpr),
    screen,
    caption,
  });
  console.log(`  shot ${file}`);
}

async function goHash(page, hash) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
}
const heading = (page, name) => page.getByRole('heading', { level: 1, name });
const openDialogs = (page) => page.locator('dialog[open]');

async function closeDialogs(page) {
  for (let i = 0; i < 8 && (await openDialogs(page).count()) > 0; i++) {
    const close = openDialogs(page).last().getByRole('button', { name: 'Close', exact: true });
    if ((await close.count()) > 0) await close.first().click({ force: true }).catch(() => undefined);
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

// ---------------------------------------------------------------------------------------------
// Flows (the e2e ones, apps/web/e2e/flows.ts)

async function freshStart(page) {
  await page.goto('/favicon.svg');
  await page.evaluate(async () => {
    localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
    for (const db of await indexedDB.databases()) {
      if (!db.name) continue;
      await new Promise((r) => {
        const q = indexedDB.deleteDatabase(db.name);
        q.onsuccess = q.onerror = q.onblocked = () => r();
      });
    }
  });
  await page.goto('/');
}

async function unlockStore(page) {
  const today = heading(page, 'Today');
  for (let attempt = 0; attempt < 8; attempt++) {
    await heading(page, 'Unlock your store').waitFor();
    await page.getByLabel('Passphrase', { exact: true }).fill(PASSPHRASE);
    await page.getByRole('button', { name: 'Unlock' }).click();
    try {
      await today.waitFor({ timeout: 30_000 });
      return;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  await today.waitFor();
}

async function setClock(page, when) {
  await page.clock.setFixedTime(when);
}

async function openCapture(page) {
  await page.getByRole('button', { name: /^Log (a|another) plate$/ }).last().click();
  const sheet = page.getByRole('dialog', { name: 'Log a plate' });
  await sheet.waitFor();
  return sheet;
}

/** Describe on this device (no AI): words -> review sheet with grams -> one plate. */
async function logDescribed(page, words, grams = []) {
  const capture = await openCapture(page);
  await capture.getByRole('button', { name: /Describe/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Describe a meal' });
  await sheet.getByLabel('What did you eat?').fill(words);
  await sheet.getByRole('button', { name: 'Find these foods' }).click();
  const review = page.getByRole('dialog', { name: /^Found \d+ foods? in your words$/ });
  await review.waitFor();
  const fields = review.getByLabel('Grams', { exact: true });
  for (let i = 0; i < grams.length; i++) {
    if (grams[i] != null) await fields.nth(i).fill(String(grams[i]));
  }
  return review;
}

async function logReview(page, review) {
  await review.getByRole('button', { name: 'Log', exact: true }).click();
  await openDialogs(page).first().waitFor({ state: 'detached' }).catch(() => undefined);
  await page.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 0);
}

/** Type it: search, pick the named match, a typed weight, Log. */
async function logTyped(page, query, match, grams) {
  const capture = await openCapture(page);
  await capture.getByRole('button', { name: /Type it/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a food' });
  await sheet.getByLabel('Food search').fill(query);
  await sheet.getByRole('button', { name: match }).first().click();
  if (grams != null) await sheet.getByLabel('Grams', { exact: true }).fill(String(grams));
  return sheet;
}

async function logTypedNow(page, query, match, grams) {
  const sheet = await logTyped(page, query, match, grams);
  await sheet.getByRole('button', { name: 'Log', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('dialog[open]').length === 0);
}

/** Every coach card on the page answered "Ask later" (so a day reads calm), but `keep`. */
async function quietCoach(page, keep = 0) {
  for (let i = 0; i < 12; i++) {
    const cards = page.getByRole('button', { name: 'Ask later' });
    const n = await cards.count();
    if (n <= keep) return;
    await cards.first().click();
    await page.waitForTimeout(200);
  }
}

// ---------------------------------------------------------------------------------------------
// PHASES

const DEBUG = process.env.SHOTS_DEBUG === '1';
async function debug(page, name) {
  if (DEBUG) await page.screenshot({ path: join(out, `_debug-${name}.png`), animations: 'disabled' });
}

/** Reload on a new pinned day (the app reads "today" when it starts) and unlock. */
async function newDay(page, when) {
  await setClock(page, when);
  await page.reload();
  await unlockStore(page);
}

// The demo week: Friday 16 to Wednesday 21 (Saturday left empty, as real weeks are), then today.
// Each plate is described in plain words and matched on this device, or typed.
const PAST_DAYS = [
  [16, [[8, 0, 'banana and yogurt'], [12, 50, 'salmon and rice'], [19, 45, 'pasta and tomato']]],
  [18, [[9, 30, 'bread and cheese'], [13, 10, 'chicken and potato'], [20, 0, 'soup and bread']]],
  [19, [[7, 50, 'oat flakes and milk'], [12, 30, 'lentils and carrot'], [19, 30, 'egg and spinach']]],
  [20, [[8, 10, 'yogurt and apple'], [12, 45, 'tuna and rice'], [15, 30, 'banana'], [19, 50, 'chicken and broccoli']]],
  [21, [[7, 45, 'bread and butter'], [13, 0, 'pasta and cheese'], [20, 15, 'salmon and potato']]],
];

async function seedPastDays(page) {
  for (const [day, plates] of PAST_DAYS) {
    await newDay(page, at(day, plates[0][0], plates[0][1]));
    for (const [hh, mm, words] of plates) {
      await setClock(page, at(day, hh, mm));
      const review = await logDescribed(page, words);
      await logReview(page, review);
    }
    console.log(`  seeded ${day} October`);
  }
}

async function phone() {
  const { context, page, problems } = await openContext(PHONE);
  await setClock(page, at(16, 7, 30));
  await freshStart(page);

  // First run: About, then the passphrase screen.
  await heading(page, 'About this app').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Got it' }).click();
  await heading(page, 'Protect your history').waitFor();
  await page.getByLabel('Passphrase', { exact: true }).fill(PASSPHRASE);
  await page.getByLabel('Confirm passphrase').fill(PASSPHRASE);
  await page.getByLabel('Confirm passphrase').blur();
  await shot(page, 'phone-create-passphrase', 'Create a passphrase',
    'The first screen: choose a passphrase that encrypts everything the app keeps in this browser.');
  await page.getByRole('button', { name: 'Create and unlock' }).click();
  await heading(page, 'Today').waitFor({ timeout: 60_000 });

  await seedPastDays(page);

  // Today, Thursday 22 October: breakfast, lunch and a snack; dinner still open.
  await newDay(page, at(TODAY, 7, 40));
  await logReview(page, await logDescribed(page, 'oat flakes and yogurt', [60, 125]));
  await setClock(page, at(TODAY, 12, 40));
  await logReview(page, await logDescribed(page, 'lentils and tomato', [180, 80]));
  // A snack: the app has three meals (and "late"), so an afternoon apple joins Lunch.
  await setClock(page, at(TODAY, 15, 40));
  await logReview(page, await logDescribed(page, 'apple', [150]));
  await setClock(page, at(TODAY, 17, 50));
  await page.reload();
  await unlockStore(page);
  await page.evaluate(() => window.scrollTo(0, 0));

  // The coach's one question under a plate.
  await shot(page, 'phone-today-coach-question', 'Today, a coach question',
    'One calm question under a plate. Sure opens a short follow-up; Ask later puts it away for good.');
  // Then a quiet day: the questions answered "Ask later".
  await quietCoach(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'phone-today', 'Today',
    'Today on a phone: each plate is a band of colour by food group, with grams and energy kept quiet.');
  await shot(page, 'phone-today-full', 'Today (whole day)',
    'The whole of Thursday: breakfast, lunch and an afternoon apple logged, dinner still open, then the day\'s nutrients.', { fullPage: true });

  // The capture sheet.
  let capture = await openCapture(page);
  await shot(page, 'phone-log-sheet', 'Log a plate',
    'Log a plate: a photo, a barcode, typing it, describing it, or a saved meal.');

  // Type it: ranked matches, a weight, the live preview.
  await capture.getByRole('button', { name: /Type it/ }).click();
  let sheet = page.getByRole('dialog', { name: 'Add a food' });
  await sheet.getByLabel('Food search').fill('lentil');
  await page.waitForTimeout(400);
  await shot(page, 'phone-type-it-matches', 'Type it',
    'Type it works offline: a few letters rank matches from the Ciqual food table on this device.');
  await sheet.getByRole('button', { name: /^Lentil/ }).first().click();
  await sheet.getByLabel('Grams', { exact: true }).fill('180');
  await sheet.getByLabel('Grams', { exact: true }).blur();
  await sheet.getByRole('button', { name: 'Log', exact: true }).scrollIntoViewIfNeeded();
  await shot(page, 'phone-type-it-grams', 'Type it, with a weight',
    'Pick a portion or type the grams; one line shows what that weight holds.');
  await closeDialogs(page);

  // Describe, matched on this device (no AI is set up).
  capture = await openCapture(page);
  await capture.getByRole('button', { name: /Describe/ }).click();
  sheet = page.getByRole('dialog', { name: 'Describe a meal' });
  await sheet.getByLabel('What did you eat?').fill('roast chicken, rice and an apple');
  await sheet.getByLabel('What did you eat?').blur();
  await shot(page, 'phone-describe', 'Describe a meal',
    'Describe a meal in your own words. With no AI set up, the words are matched on this device.');
  await sheet.getByRole('button', { name: 'Find these foods' }).click();
  await page.getByRole('dialog', { name: /^Found \d+ foods? in your words$/ }).waitFor();
  await shot(page, 'phone-describe-review', 'Describe, review',
    'The matches come back ticked for review, each with a portion to check before anything is logged.');
  await closeDialogs(page);

  // Barcode: the fake camera shows a real EAN-13; Open Food Facts is answered locally.
  capture = await openCapture(page);
  await capture.getByRole('button', { name: /Barcode/ }).click();
  const notice = page.getByRole('dialog', { name: 'Barcode lookups' });
  await notice.waitFor({ timeout: 30_000 });
  await shot(page, 'phone-barcode-notice', 'Barcode lookups notice',
    'Before the first lookup the app says what Open Food Facts will see, and waits for an answer.');
  await notice.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('dialog', { name: 'Crunchy oat muesli' }).waitFor({ timeout: 30_000 });
  await debug(page, 'barcode');
  await shot(page, 'phone-barcode-match', 'Barcode match',
    'A scanned barcode, read on the device and looked up on Open Food Facts, ready to log.');
  // Close the scanner itself (closing only the match would let the camera find the code again).
  await page.getByRole('dialog', { name: 'Scan a barcode' }).getByRole('button', { name: 'Close' }).first()
    .click({ force: true });
  await closeDialogs(page);

  // A recipe pasted as text, read on this device.
  capture = await openCapture(page);
  await capture.getByRole('button', { name: 'Saved meals and recipes' }).click();
  sheet = page.getByRole('dialog', { name: 'Saved meals and recipes' });
  await sheet.getByRole('button', { name: 'New recipe' }).click();
  const editor = page.getByRole('dialog', { name: 'New recipe' });
  await editor.getByRole('button', { name: 'Paste a recipe' }).click();
  await editor.getByLabel('Recipe text').fill(RECIPE);
  await editor.getByRole('button', { name: 'Read this recipe' }).click();
  await editor.getByLabel('Recipe name').waitFor();
  await page.waitForTimeout(300);
  await shot(page, 'phone-recipe-paste', 'Paste a recipe',
    'A pasted recipe is read on the device: name, servings and each ingredient with its grams, for review.');
  await closeDialogs(page);

  // A plate's own page: its foods, and the nutrients against a reference intake.
  await page.locator('[data-testid^="open-plate-"]').nth(1).click({ position: { x: 12, y: 12 } });
  await page.getByRole('button', { name: 'Save as a meal' }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'phone-plate-detail', 'Plate',
    'One plate: what is on it, the grams, and its nutrients set against a daily reference intake.');
  await shot(page, 'phone-plate-detail-full', 'Plate (whole page)',
    'The whole plate page, down to the nutrients and the actions to log it again or save it as a meal.',
    { fullPage: true });

  // The week.
  await goHash(page, '#/week');
  await heading(page, 'This week').waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'phone-week', 'This week',
    'The week as a row of towels, one per day, with a short plain summary of what was logged.');
  await shot(page, 'phone-week-full', 'This week (whole page)',
    'The whole week page.', { fullPage: true });

  // Ask the coach, with no AI set up.
  await goHash(page, '#/coach');
  await heading(page, 'Ask the coach').waitFor();
  await shot(page, 'phone-ask-coach', 'Ask the coach',
    'Ask the coach is an optional AI chat about the last seven days; it stays off until an AI is set up.');

  // Settings.
  for (const [hash, file, screen, caption] of SETTINGS) {
    await goHash(page, hash);
    await page.getByRole('heading', { level: 1, name: screen }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, file, screen, caption);
  }

  // Your data, after a real export (the date of the last export shows).
  await goHash(page, '#/settings/data');
  await heading(page, 'Your data').waitFor();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  await download.delete();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'phone-your-data', 'Your data',
    'Your data: encrypted at rest, exported as plain CSV when you choose, locked or erased in one place.');
  await shot(page, 'phone-your-data-full', 'Your data (whole page)',
    'The whole Your data page, with the encrypted backup file and the restore.', { fullPage: true });

  // A photo with an AI set up (own key; nothing is sent): the consent comes first.
  await goHash(page, '#/settings/ai');
  await heading(page, 'Your AI').waitFor();
  await page.getByText('My own key', { exact: true }).click();
  await page.getByLabel('Endpoint').fill('https://api.example.com/v1');
  await page.getByLabel('Model', { exact: true }).fill('vision-1');
  await page.getByLabel('API key').fill('sk-demo-0000-not-a-real-key-7c2e');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Saved.').waitFor();
  await page.getByText(/key saved/).scrollIntoViewIfNeeded();
  await shot(page, 'phone-your-ai-own-key', 'Your AI, own key',
    'With your own key the app talks to the endpoint you chose; the key is stored encrypted and shown only by its last characters.');
  let sent = 0;
  page.on('request', (r) => {
    if (r.url().startsWith('https://api.example.com')) sent++;
  });
  await page.route('https://api.example.com/**', (route) => route.abort());
  await goHash(page, '#/');
  await heading(page, 'Today').waitFor();
  capture = await openCapture(page);
  await capture.getByRole('button', { name: /Snapshot/ }).click();
  const snap = page.getByRole('dialog', { name: 'Snap a plate' });
  await snap.waitFor();
  await debug(page, 'snap');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    snap.getByRole('button', { name: 'Choose a photo' }).click(),
  ]);
  await chooser.setFiles(PLATE_PHOTO);
  await page.locator('dialog[open]').filter({ hasText: /api\.example\.com/ }).waitFor({ timeout: 20_000 });
  await shot(page, 'phone-photo-consent', 'Photo consent',
    'Before a photo leaves the device the app names where it goes and asks; nothing is sent without a yes.');
  await page.getByRole('button', { name: /Don.t send|Not now|Cancel/ }).first().click();
  if (sent !== 0) throw new Error('a request reached the demo AI endpoint');
  // "Not now" leaves the calm no-AI result (closest matches); close it.
  await page.locator('dialog[open]').filter({ hasText: 'Pick a closest match' }).first()
    .waitFor({ timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  await closeDialogs(page);

  // The lock screen.
  await goHash(page, '#/');
  await heading(page, 'Today').waitFor();
  await page.getByRole('button', { name: 'Lock' }).first().click();
  await heading(page, 'Unlock your store').waitFor();
  await shot(page, 'phone-unlock', 'Unlock',
    'Locked: nothing decrypted is left on the page until the passphrase is entered again.');

  if (problems.length > 0) console.warn('page problems:', problems);
  await context.close();
}

const RECIPE = [
  'Lentil and tomato soup',
  'Serves 4',
  'Ingredients',
  '250 g green lentils',
  '2 tomatoes',
  '2 carrots',
  '1 onion',
  '1 tbsp olive oil',
  'Method',
  'Simmer everything for 30 minutes, then season.',
].join('\n');

// A simple drawn plate (no real photo is in the repo); it only stands behind the consent dialog.
const PLATE_PHOTO = join(scratch, 'plate.jpg');
{
  const r = spawnSync('magick', [
    '-size', '1200x900', 'xc:#b08a64',
    '-fill', '#f4f1ea', '-draw', 'circle 600,450 600,95',
    '-fill', '#e9e4d8', '-draw', 'circle 600,450 600,150',
    '-fill', '#7a4a2a', '-draw', 'ellipse 520,430 170,120 0,360',
    '-fill', '#c8372d', '-draw', 'circle 700,360 700,300',
    '-fill', '#d9452f', '-draw', 'circle 760,470 760,415',
    '-fill', '#4f8a3c', '-draw', 'ellipse 650,600 150,60 0,360',
    '-blur', '0x2', '-quality', '85', PLATE_PHOTO,
  ]);
  if (r.status !== 0) throw new Error(`could not draw the plate photo: ${r.stderr}`);
}

const SETTINGS = [
  ['#/settings', 'phone-settings', 'Settings',
    'Settings: your AI, your data, privacy, nutrition numbers, language and installing the app.'],
  ['#/settings/ai', 'phone-your-ai', 'Your AI',
    'Your AI: no AI at all, a server that offers one, or your own key. The app works fully without any.'],
  ['#/settings/privacy', 'phone-privacy', 'What this app stores and sends',
    'What this app stores and sends, in plain words, readable even before the unlock.'],
  ['#/settings/nutrition', 'phone-nutrition', 'Nutrition',
    'Nutrition: show or hide the grams and nutrient numbers; the bands of colour stay either way.'],
  ['#/settings/language', 'phone-language', 'Language',
    'Language: follow the device, or choose English or French.'],
  ['#/settings/install', 'phone-install', 'Install on your phone',
    'Install on your phone: add the app to the home screen to use it offline with its own icon.'],
];

// The same store, reopened in a desktop window (1440 x 900, scale 1).
async function desktop() {
  const { context, page, problems } = await openContext(DESKTOP);
  await setClock(page, at(TODAY, 17, 50));
  await page.goto('/');
  await unlockStore(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'desktop-today', 'Today (desktop)',
    'Today on a wide screen: the rail on the left, the day towel in the middle, the week beside it.');

  await goHash(page, '#/week');
  await heading(page, 'This week').waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'desktop-week', 'This week (desktop)',
    'The week on a wide screen: one towel per day by food group, and the week in short.');

  await goHash(page, '#/');
  await heading(page, 'Today').waitFor();
  await page.locator('[data-testid^="open-plate-"]').nth(1).click({ position: { x: 12, y: 12 } });
  await page.getByRole('button', { name: 'Save as a meal' }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'desktop-plate', 'Plate (desktop)',
    'A plate on a wide screen: its foods and grams, and the nutrients against a daily reference intake.');

  await goHash(page, '#/');
  await heading(page, 'Today').waitFor();
  await openCapture(page);
  await shot(page, 'desktop-log-sheet', 'Log a plate (desktop)',
    'On a wide screen the ways to log a plate open as a centred dialog.');
  await closeDialogs(page);

  if (problems.length > 0) console.warn('page problems:', problems);
  await context.close();
}


async function main() {
  const server = await startServer();
  mkdirSync(out, { recursive: true });
  try {
    await phone();
    await desktop();
  } finally {
    server.kill();
  }
  convert();
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  rmSync(scratch, { recursive: true, force: true });
  console.log(`${manifest.length} shots -> ${out}`);
}

function convert() {
  const haveCwebp = spawnSync('cwebp', ['-version']).status === 0;
  for (const name of readdirSync(pngDir)) {
    const src = join(pngDir, name);
    const dest = join(out, name.replace(/\.png$/, '.webp'));
    const r = haveCwebp
      ? spawnSync('cwebp', ['-quiet', '-q', String(quality), '-m', '6', '-metadata', 'none', src, '-o', dest])
      : spawnSync('magick', [src, '-quality', String(quality), '-define', 'webp:method=6', dest]);
    if (r.status !== 0) throw new Error(`webp conversion failed for ${name}: ${r.stderr}`);
    if (keepPng) spawnSync('cp', [src, join(out, name)]);
  }
}

await main();
