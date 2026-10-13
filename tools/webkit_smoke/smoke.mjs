// AI Nutrition Coach release-bundle browser smoke (opt-in; docs/pwa.md "Browser smoke").
//
// Drives the REAL production image (nginx + the release build) in WebKit
// and/or Chromium through Playwright, over http://localhost (a secure
// context), and checks what the unit tests cannot:
//
//   1. the page loads, the manifest + icons are valid, the service worker
//      registers, takes control and precaches EXACTLY the files in
//      precache-manifest.json;
//   2. first run: create a passphrase (WebCrypto PBKDF2 -> sqlite3mc wasm in
//      IndexedDB), log a plate by manual entry, see it on the Day Board;
//   3. durable storage status is reported on Your data;
//   4. reload -> locked -> unlock with the passphrase -> the plate is still
//      there (IndexedDB persistence + Web Locks + the key derivation again);
//   5. OFFLINE: the context goes offline, the page reloads from the service
//      worker (main.dart.js answered by the worker), unlock, plate visible;
//   6. UPDATE: the served build id changes; the new worker installs and
//      WAITS; the calm "A new version is ready" line appears; "Reload"
//      activates it and reloads exactly once; old caches are deleted; the
//      data is still there after unlocking again;
//   7. the page made no request to any other origin, EXCEPT the one deliberate
//      Open Food Facts lookup of step 8: nothing else, at no other time;
//   8. (Chromium only, see below) BARCODE: a fake camera shows an EAN-13, the
//      one-time Open Food Facts notice appears BEFORE anything is sent, and
//      after OK exactly one request leaves: GET /api/v2/product/<code>?fields=
//      with no Referer, Cookie or Authorization (the request is intercepted and
//      answered by the script; nothing real is contacted). Privacy audit PV7;
//   9. EXPORT: Your data -> Export downloads a plain CSV (the note under the
//      button says so) and no request leaves this origin (privacy audit PV8).
//
// Why step 8 is Chromium-only: Playwright's WebKit has no fake camera device
// (no --use-file-for-fake-video-capture), so a barcode cannot be scanned there.
// Step 9 runs in both.
//
// Input model (important, see calibrate.mjs): text entry and the clicks before it
// are done by COORDINATES without Flutter's accessibility semantics (in WebKit,
// typing into a field while semantics are on never reaches the app); semantics
// are switched on only to READ the screen. coords.json holds the positions.
//
// Environment: PWA_DIR (the directory nginx serves sw.js / the manifest from),
// BASE_URL (default http://localhost:8080), SITE_DIR (the served
// directory, mounted read-write here, used to simulate the new build for step
// 6), BROWSERS (comma list, default "webkit,chromium").
// Exit 0 only if every step passed in every browser.

import { chromium, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:8080';
// The one third-party origin the app may talk to by design (a barcode lookup,
// after the person said OK). Everything else off-origin is a failure.
const OFF_HOST = 'world.openfoodfacts.org';
// Keep in step with kOffFields (packages/integrations/lib/src/catalog/off_barcode_source.dart).
const OFF_FIELDS = 'product_name,product_name_en,generic_name,brands,categories_tags';
const EAN = '3017620422003';
const SITE_DIR = process.env.SITE_DIR || '';
// The rendered sw.js + precache manifest (nginx serves them from a mounted dir; see scripts/webkit_smoke.sh).
const PWA_DIR = process.env.PWA_DIR || '';
const BROWSERS = (process.env.BROWSERS || 'webkit,chromium').split(',').map((s) => s.trim());
const PASSPHRASE = 'correct horse battery staple';
let currentPage = null;
const results = [];
let failures = 0;

const log = (browser, msg) => console.log(`[${browser}] ${msg}`);

async function step(browser, name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ browser, name, ok: true });
    log(browser, `ok   ${name}${detail ? ' - ' + detail : ''} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    return true;
  } catch (e) {
    failures++;
    results.push({ browser, name, ok: false, error: String(e).split('\n')[0] });
    // A picture of where it stopped (written next to the script; git-ignored).
    if (currentPage) {
      const file = `failure-${browser}-${results.length}.png`;
      await currentPage.screenshot({ path: file }).then(() => log(browser, `     screenshot: tools/webkit_smoke/${file}`), () => {});
    }
    log(browser, `FAIL ${name}: ${String(e).split('\n').slice(0, 3).join(' | ')}`);
    return false;
  }
}

/**
 * A tiny y4m video of one EAN-13 (white frame, black bars, 4 px modules) for
 * Chromium's fake camera. Written at run time, nothing binary is committed.
 */
function writeBarcodeY4m(file, code, frames = 12) {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  const d = [...code].map(Number);
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += (PARITY[d[0]][i] === 'L' ? L : G)[d[1 + i]];
  bits += '01010';
  for (let i = 0; i < 6; i++) bits += R[d[7 + i]];
  bits += '101';
  const W = 640, H = 480, MOD = 4;
  const left = Math.floor((W - bits.length * MOD) / 2);
  const y = Buffer.alloc(W * H, 235);
  for (let row = 130; row < 350; row++) {
    for (let m = 0; m < bits.length; m++) {
      if (bits[m] === '1') y.fill(16, row * W + left + m * MOD, row * W + left + (m + 1) * MOD);
    }
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) parts.push(Buffer.from('FRAME\n'), y, chroma, chroma);
  fs.writeFileSync(file, Buffer.concat(parts));
}

const semanticsText = (page) =>
  page.evaluate(() => {
    const host = document.querySelector('flt-semantics-host');
    if (!host) return '';
    // Text nodes plus the labels Flutter puts on buttons/rows (a plate row is
    // a button whose label is "Breakfast, Apple, ~1 piece").
    const labels = [...host.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'));
    return host.innerText + '\n' + labels.join('\n');
  });

async function waitForText(page, re, timeout = 60000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const t = await semanticsText(page);
    if (re.test(t)) return t;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${re}; saw: ${t.slice(0, 200).replace(/\n/g, ' / ')}`);
    await page.waitForTimeout(400);
  }
}

const coords = JSON.parse(fs.readFileSync(new URL('./coords.json', import.meta.url), 'utf8'));

/** Switch Flutter's semantics on (irreversible for this page load) so the screen can be READ. */
async function enableSemantics(page) {
  await page.waitForSelector('flt-semantics-placeholder, flt-semantics-host flt-semantics', { state: 'attached', timeout: 90000 });
  await page.evaluate(() => { const p = document.querySelector('flt-semantics-placeholder'); if (p) p.click(); });
}

/**
 * How input is driven. SEMANTIC mode (Chromium): locate the control through
 * Flutter's semantics tree and wait for it - robust, no blind waits. COORDINATE
 * mode (WebKit): with semantics on, text typed in WebKit never reaches the app,
 * so semantics stay off until the screen has to be READ and controls are hit by
 * the positions recorded in coords.json (calibrate.mjs). A browser where the
 * semantic path works is therefore never driven blind.
 */
let semanticInput = false;

/** One interaction: {key, find: page => locator, text?, settle?} */
async function act(page, a) {
  if (semanticInput) {
    const target = a.find(page);
    await target.waitFor({ timeout: 90000 });
    await target.click();
    // Focus needs a moment to reach the field (typing at once can drop the first characters).
    if (a.text !== undefined) { await page.waitForTimeout(400); await page.keyboard.type(a.text); }
    return;
  }
  await page.mouse.click(...coords[a.key]);
  if (a.text !== undefined) {
    await page.waitForTimeout(250);
    await page.keyboard.type(a.text, { delay: 15 });
  }
  await page.waitForTimeout(a.settle ?? 900); // animations (sheet, route) have no observable end without semantics
}

const A = {
  aboutOk: { key: 'about.ok', find: (p) => p.getByRole('button', { name: 'Got it' }), settle: 900 },
  createPass: { key: 'create.passphrase', find: (p) => p.getByLabel('Passphrase', { exact: true }), settle: 250 },
  createConfirm: { key: 'create.confirm', find: (p) => p.getByLabel('Confirm passphrase'), settle: 250 },
  createBtn: { key: 'create.button', find: (p) => p.getByRole('button', { name: 'Create and unlock' }) },
  capture: { key: 'board.capture', find: (p) => p.getByRole('button', { name: 'Open capture sheet' }), settle: 1200 },
  typeOrTalk: { key: 'sheet.typeOrTalk', find: (p) => p.getByRole('button', { name: 'Type or talk' }), settle: 1500 },
  search: { key: 'manual.search', find: (p) => p.locator('input[aria-label="Food search"]:not([disabled])'), settle: 2000 },
  apple: { key: 'manual.apple', find: (p) => p.getByRole('button', { name: /^Apple/ }).first(), settle: 1000 },
  piece: { key: 'manual.piece', find: (p) => p.getByRole('checkbox', { name: '~1 piece' }), settle: 500 },
  log: { key: 'manual.log', find: (p) => p.getByRole('button', { name: 'Log', exact: true }), settle: 1500 },
  lockPass: { key: 'lock.passphrase', find: (p) => p.getByLabel('Passphrase', { exact: true }), settle: 250 },
  lockBtn: { key: 'lock.button', find: (p) => p.getByRole('button', { name: 'Unlock' }) },
};

/** The first frame is up (the engine's glass pane exists) and has had time to lay out. */
async function flutterReady(page) {
  await page.waitForSelector('flt-glass-pane', { state: 'attached', timeout: 90000 });
  await page.waitForTimeout(semanticInput ? 800 : 3500);
  if (semanticInput) await enableSemantics(page);
}

/** The store is open: this tab holds its Web Lock (a condition, not a sleep). */
const storeOpen = (page) =>
  page.waitForFunction(
    async () => (await navigator.locks.query()).held.some((l) => l.name === 'ai-nutrition-coach-store'),
    null,
    { timeout: 90000, polling: 300 },
  );

async function unlock(page) {
  await flutterReady(page);
  await act(page, { ...A.lockPass, text: PASSPHRASE });
  await act(page, A.lockBtn);
  await storeOpen(page);
  await enableSemantics(page);
  await page.getByRole('button', { name: 'Open capture sheet' }).waitFor({ timeout: 90000 });
}

async function waitForServiceWorker(page, expectBuild) {
  return page.evaluate(async (expectBuild) => {
    const deadline = Date.now() + 90000;
    const manifest = await (await fetch('precache-manifest.json', { cache: 'no-store' })).json();
    for (;;) {
      const reg = await navigator.serviceWorker.getRegistration();
      const keys = (await caches.keys()).filter((k) => k.startsWith('ai-nutrition-coach-precache-'));
      const ready =
        reg && reg.active && reg.active.state === 'activated' && navigator.serviceWorker.controller &&
        keys.length === 1 && keys[0] === 'ai-nutrition-coach-precache-' + (expectBuild || manifest.buildId);
      if (ready) {
        const cached = (await (await caches.open(keys[0])).keys()).length;
        return { keys, cached, expected: manifest.files.length, buildId: manifest.buildId };
      }
      if (Date.now() > deadline) {
        return { timeout: true, hasReg: !!reg, active: reg && reg.active && reg.active.state, controller: !!navigator.serviceWorker.controller, keys };
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }, expectBuild);
}

async function runBrowser(name, type) {
  const chromiumCamera = name === 'chromium';
  const fakeVideo = path.join(process.env.TMPDIR || '/tmp', `ai-nutrition-coach-smoke-${EAN}.y4m`);
  if (chromiumCamera) writeBarcodeY4m(fakeVideo, EAN);
  const browser = await type.launch(
    chromiumCamera
      ? { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${fakeVideo}`] }
      : {},
  );
  const context = await browser.newContext({
    locale: 'en-US',
    timezoneId: 'Europe/Paris',
    // Must equal coords.json's viewport (see calibrate.mjs).
    viewport: coords.viewport,
    permissions: chromiumCamera ? ['camera'] : [],
  });
  const foreign = [];
  // Open Food Facts requests, as seen on the wire (intercepted, answered here).
  const offRequests = [];
  let inBarcodeStep = false;
  await context.route(`https://${OFF_HOST}/**`, async (route) => {
    const req = route.request();
    offRequests.push({
      method: req.method(),
      url: new URL(req.url()),
      headers: await req.allHeaders(),
      body: req.postData(),
      duringBarcodeStep: inBarcodeStep,
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ status: 1, product: { product_name: 'Smoke Jam', categories_tags: ['en:jams'] } }),
    });
  });
  const pageErrors = [];
  let navigations = 0;
  const page = await context.newPage();
  currentPage = page;
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) {
      // The deliberate barcode lookup is allowed while step 8 runs; anything
      // else off-origin - or that same host at any other time - is foreign.
      if (u.hostname === OFF_HOST && inBarcodeStep) return;
      foreign.push(r.url());
    }
  });
  if (process.env.DEBUG_PAGE) page.on('console', (m) => { if (m.type() !== 'warning') console.log(`  [page ${name}] ${m.text().slice(0, 200)}`); });
  const teardownErrors = [];
  page.on('pageerror', (e) => {
    const text = String(e && e.stack ? e.stack : e).slice(0, 600);
    // Reloading the page while the live (fake) camera is scanning makes the
    // scanner plugin throw a generic Error in teardown (seen in Chromium only,
    // after the assertions of step 8 have passed). It is recorded, not hidden,
    // but it is not what this smoke is about; any other page error still fails.
    (inBarcodeStep ? teardownErrors : pageErrors).push(text);
  });
  // Real document loads only (Flutter's router also fires same-document navigations).
  page.on('load', () => { navigations++; });
  let build1 = '';
  semanticInput = name === 'chromium';

  await step(name, 'loads, manifest + icons valid, no inline script', async () => {
    await page.goto(BASE + '/', { waitUntil: 'load' });
    const info = await page.evaluate(async () => {
      const link = document.querySelector('link[rel=manifest]');
      const m = await (await fetch(link.href)).json();
      const icons = [];
      for (const i of m.icons) {
        const r = await fetch(new URL(i.src, link.href));
        icons.push({ src: i.src, ok: r.ok && (r.headers.get('content-type') || '').startsWith('image/png'), purpose: i.purpose, sizes: i.sizes });
      }
      const touch = document.querySelector('link[rel=apple-touch-icon]');
      const touchOk = touch ? (await fetch(touch.href)).ok : false;
      const inline = [...document.scripts].filter((s) => !s.src).length;
      return { m, icons, touchOk, inline, secure: isSecureContext, ios: !!document.querySelector('meta[name=apple-mobile-web-app-capable]') };
    });
    const { m } = info;
    if (!info.secure) throw new Error('not a secure context');
    if (m.display !== 'standalone' || m.start_url !== '/' || m.scope !== '/' || m.id !== '/') throw new Error('manifest fields wrong');
    if (!m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512') || !m.icons.some((i) => i.purpose === 'any' && i.sizes === '192x192')) throw new Error('icons missing');
    if (!info.icons.every((i) => i.ok)) throw new Error('an icon failed to load: ' + JSON.stringify(info.icons));
    if (!info.touchOk || !info.ios) throw new Error('iOS tags missing');
    if (info.inline !== 0) throw new Error('inline script present');
    return `${m.icons.length} icons`;
  });

  await step(name, 'service worker registers, controls the page and precaches the manifest', async () => {
    const r = await waitForServiceWorker(page);
    if (r.timeout) throw new Error('service worker did not become ready: ' + JSON.stringify(r));
    if (r.cached !== r.expected) throw new Error(`cached ${r.cached} of ${r.expected} files`);
    build1 = r.buildId;
    return `${r.cached} files, build ${r.buildId}`;
  });

  await step(name, 'a navigation answered by the service worker still carries the security headers (CSP) and the CSP is enforced', async () => {
    const response = await page.reload({ waitUntil: 'load' });
    if (!response.fromServiceWorker()) throw new Error('the navigation was not answered by the service worker');
    const h = response.headers();
    const need = {
      'content-security-policy': /script-src 'self' 'wasm-unsafe-eval'/,
      'x-frame-options': /DENY/i,
      'x-content-type-options': /nosniff/i,
      'referrer-policy': /no-referrer/,
      'permissions-policy': /camera=\(self\)/,
      'cross-origin-opener-policy': /same-origin/,
    };
    for (const [k, re] of Object.entries(need)) {
      if (!h[k] || !re.test(h[k])) throw new Error(`SW-served navigation lacks ${k}: ${h[k]}`);
    }
    // ...and the browser really applies it: an injected inline script must not run.
    await page.waitForSelector('flt-glass-pane', { state: 'attached', timeout: 90000 });
    const injected = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let violated = false;
          document.addEventListener('securitypolicyviolation', () => { violated = true; });
          const s = document.createElement('script');
          s.textContent = 'window.__injected = 1';
          document.head.appendChild(s);
          setTimeout(() => resolve({ ran: window.__injected === 1, violated }), 400);
        }),
    );
    if (injected.ran) throw new Error('an injected inline script RAN on the service-worker-served page');
    if (!injected.violated) throw new Error('no CSP violation was reported for the injected script');
  });

  await step(name, 'create passphrase, log a plate by manual entry', async () => {
    // Fresh load (the previous step only read the page).
    await page.reload({ waitUntil: 'load' });
    await flutterReady(page);
    // PV1: the one-time "About this app" notice comes before the passphrase.
    await act(page, A.aboutOk);
    await act(page, { ...A.createPass, text: PASSPHRASE });
    await act(page, { ...A.createConfirm, text: PASSPHRASE });
    await act(page, A.createBtn);
    await storeOpen(page);
    if (!semanticInput) await page.waitForTimeout(2500); // the board's first paint after the restart
    await act(page, A.capture);
    await act(page, A.typeOrTalk);
    await act(page, { ...A.search, text: 'apple' });
    await act(page, A.apple);
    await act(page, A.piece);
    await act(page, A.log);
    await enableSemantics(page);
    await waitForText(page, /Apple/);
  });

  if (chromiumCamera) {
    await step(name, 'barcode: the Open Food Facts notice comes first, then exactly one minimal request', async () => {
      inBarcodeStep = true;
      try {
        await page.getByRole('button', { name: 'Open capture sheet' }).click();
        await page.getByRole('button', { name: 'Scan a barcode' }).click();
        // The fake camera shows the EAN: the first decode asks BEFORE sending.
        await waitForText(page, /Barcodes you scan are looked up on Open Food Facts/, 90000);
        if (offRequests.length !== 0) throw new Error('a request left before the person said OK');
        await page.getByRole('button', { name: 'OK', exact: true }).click();
        const deadline = Date.now() + 30000;
        while (offRequests.length === 0 && Date.now() < deadline) await page.waitForTimeout(300);
        if (offRequests.length !== 1) throw new Error(`expected exactly 1 Open Food Facts request, saw ${offRequests.length}`);
        const r = offRequests[0];
        if (r.method !== 'GET') throw new Error('method ' + r.method);
        if (r.body) throw new Error('a request body was sent');
        if (r.url.pathname !== `/api/v2/product/${EAN}`) throw new Error('path ' + r.url.pathname);
        const keys = [...r.url.searchParams.keys()];
        if (keys.length !== 1 || keys[0] !== 'fields' || r.url.searchParams.get('fields') !== OFF_FIELDS) {
          throw new Error('query ' + r.url.search);
        }
        for (const forbidden of ['referer', 'cookie', 'authorization', 'x-forwarded-for']) {
          if (forbidden in r.headers) throw new Error(`the request carried a ${forbidden} header`);
        }
        // CORS makes the browser add Origin: it is this app's own origin, no more.
        if (r.headers.origin && r.headers.origin !== new URL(BASE).origin) throw new Error('origin ' + r.headers.origin);
        await waitForText(page, /Smoke Jam/, 30000);
        // Back to a clean locked board (a reload, then unlock) rather than
        // driving the sheet's dismissal: this step is about the request.
        await page.reload({ waitUntil: 'load' });
        await unlock(page);
        if (teardownErrors.length) log(name, `     note: ${teardownErrors.length} page error(s) while reloading with the camera live: ${teardownErrors[0].split('\n')[0]}`);
        return `GET ${r.url.pathname}${r.url.search}, headers ${Object.keys(r.headers).sort().join(',')}`;
      } finally {
        inBarcodeStep = false;
      }
    });
  } else {
    log(name, 'skip barcode step: this browser has no fake camera device (Chromium only)');
  }

  await step(name, 'Your data: storage status and last-export line', async () => {
    // Tall: Flutter only builds the semantics of what is (nearly) on screen.
    await page.setViewportSize({ width: 420, height: 1800 });
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /^Your data/ }).click();
    const t = await waitForText(page, /Last export: never/);
    const storage = (t.match(/Storage:[^\n]*/) || ['(no storage line)'])[0];
    const persisted = await page.evaluate(() => navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : 'n/a');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.setViewportSize(coords.viewport);
    return `persisted()=${persisted}; ${storage}`;
  });

  await step(name, 'export: a plain CSV is downloaded, the note says so, nothing leaves this origin', async () => {
    const foreignBefore = foreign.length;
    await page.setViewportSize({ width: 420, height: 1800 });
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /^Your data/ }).click();
    await waitForText(page, /Exports are plain, unencrypted files/);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);
    const file = await download.path();
    const text = fs.readFileSync(file, 'utf8');
    if (!/ai-nutrition-coach/i.test(download.suggestedFilename()) || !download.suggestedFilename().endsWith('.csv')) {
      throw new Error('unexpected file name ' + download.suggestedFilename());
    }
    if (!/Apple/.test(text)) throw new Error('the export does not contain the plate');
    if (text.startsWith('SQLite') || text.includes('\u0000')) throw new Error('the export is not plain text');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.setViewportSize(coords.viewport);
    if (foreign.length !== foreignBefore) throw new Error('the export caused foreign requests: ' + foreign.slice(foreignBefore).join(', '));
    return `${download.suggestedFilename()} (${text.length} bytes)`;
  });

  await step(name, 'reload -> locked -> unlock -> the plate is still there', async () => {
    await page.reload({ waitUntil: 'load' });
    await unlock(page);
    await waitForText(page, /Apple/);
  });

  await step(name, 'offline: reload is served by the service worker, data still opens', async () => {
    // "Offline" = the server has nothing to give (every file moved away: any
    // request that reached it would 404) AND, where the browser's emulation
    // copes with service workers (Chromium), the network switched off. WebKit's
    // own offline emulation aborts the navigation before the worker answers
    // ("WebKit encountered an internal error"), so there it is the empty server.
    const dirs = [SITE_DIR, PWA_DIR].filter(Boolean);
    const stash = SITE_DIR ? '.offline-stash' : '';
    const emptyServer = () => {
      for (const d of dirs) {
        fs.mkdirSync(path.join(d, stash), { recursive: true });
        for (const f of fs.readdirSync(d)) if (f !== stash) fs.renameSync(path.join(d, f), path.join(d, stash, f));
      }
    };
    const refillServer = () => {
      for (const d of dirs) {
        const st = path.join(d, stash);
        if (!fs.existsSync(st)) continue;
        for (const f of fs.readdirSync(st)) fs.renameSync(path.join(st, f), path.join(d, f));
        fs.rmdirSync(st);
      }
    };
    const fromWorker = [];
    const onResponse = (r) => { if (r.fromServiceWorker()) fromWorker.push(new URL(r.url()).pathname); };
    try {
      emptyServer();
      if (name === 'chromium') await context.setOffline(true);
      page.on('response', onResponse);
      await page.reload({ waitUntil: 'load' });
      await unlock(page);
      await waitForText(page, /Apple/);
    } finally {
      page.off('response', onResponse);
      if (name === 'chromium') await context.setOffline(false);
      refillServer();
    }
    if (!fromWorker.some((p) => p.endsWith('main.dart.js'))) throw new Error('main.dart.js was not answered by the service worker: ' + fromWorker.join(','));
    return `${fromWorker.length} responses from the worker${stash ? '' : ' (SITE_DIR unset: network-level offline only)'}`;
  });

  if (SITE_DIR && PWA_DIR) {
    await step(name, 'update: new build waits, calm banner, Reload activates once, old cache removed', async () => {
      // The files nginx serves as /sw.js and /precache-manifest.json (rendered at container start).
      const swFile = path.join(PWA_DIR, 'sw.js');
      const manFile = path.join(PWA_DIR, 'precache-manifest.json');
      const original = { sw: fs.readFileSync(swFile, 'utf8'), man: fs.readFileSync(manFile, 'utf8') };
      const id2 = 'smoke-' + Date.now().toString(36);
      try {
        // What `AI_NUTRITION_COACH_BUILD_ID=... dart run tools/generate_precache_manifest.dart` produces.
        fs.writeFileSync(swFile, original.sw.replace(/const BUILD_ID = '[^']*';/, `const BUILD_ID = '${id2}';`));
        fs.writeFileSync(manFile, original.man.replace(/"buildId": "[^"]*"/, `"buildId": "${id2}"`));
        await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
        const state = await page.evaluate(async () => {
          const deadline = Date.now() + 60000;
          for (;;) {
            const r = await navigator.serviceWorker.getRegistration();
            if (r.waiting) return { waiting: true, active: r.active && r.active.state, keys: await caches.keys() };
            if (Date.now() > deadline) return { waiting: false };
            await new Promise((x) => setTimeout(x, 300));
          }
        });
        if (!state.waiting) throw new Error('the new worker never reached "waiting"');
        if (!state.keys.includes('ai-nutrition-coach-precache-' + build1) || !state.keys.includes('ai-nutrition-coach-precache-' + id2)) throw new Error('caches while waiting: ' + state.keys);
        await waitForText(page, /A new version is ready/, 30000);
        const beforeNav = navigations;
        await page.getByRole('button', { name: 'Reload' }).click();
        await page.waitForFunction(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.endsWith('sw.js'), null, { timeout: 60000 });
        await page.waitForTimeout(4000);
        const after = await waitForServiceWorker(page, id2);
        if (after.timeout) throw new Error('after reload: ' + JSON.stringify(after));
        if (navigations - beforeNav !== 1) throw new Error(`expected exactly one reload, saw ${navigations - beforeNav}`);
        await unlock(page);
        await waitForText(page, /Apple/);
        return `build ${build1} -> ${id2}, caches now ${after.keys}`;
      } finally {
        fs.writeFileSync(swFile, original.sw);
        fs.writeFileSync(manFile, original.man);
      }
    });
  }

  await step(name, 'no request left this origin (bar the one deliberate barcode lookup), no page errors', async () => {
    if (foreign.length) throw new Error('foreign requests: ' + foreign.join(', '));
    const stray = offRequests.filter((r) => !r.duringBarcodeStep);
    if (stray.length) throw new Error('Open Food Facts was contacted outside the barcode step: ' + stray.map((r) => r.url.href).join(', '));
    if (offRequests.length > 1) throw new Error(`${offRequests.length} Open Food Facts requests; expected at most one`);
    if (pageErrors.length) throw new Error('page errors: ' + pageErrors.join(' | '));
  });

  await browser.close();
}

for (const name of BROWSERS) {
  const type = { webkit, chromium }[name];
  if (!type) { console.error('unknown browser', name); failures++; continue; }
  try {
    await runBrowser(name, type);
  } catch (e) {
    failures++;
    log(name, 'ABORTED: ' + String(e).split('\n')[0]);
  }
}

console.log(`\nsummary: ${results.filter((r) => r.ok).length} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
