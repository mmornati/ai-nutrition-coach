// Capture, end to end in a real browser, against the built app under its production CSP:
//  - the zxing-wasm reader and wasm are served from OUR origin at /zxing/3.1.1/ (never a CDN) and
//    decode a rendered EAN-13 still;
//  - Chromium's fake camera plays a generated barcode clip: getUserMedia -> zxing -> scan flow ->
//    catalog -> Open Food Facts;
//  - the OFF request is exactly GET /api/v2/product/<barcode>?fields=... with an Accept and no
//    Referer, Cookie or Authorization (a cookie for the OFF host is planted to prove it is not sent);
//  - nothing is sent before the person said OK.
// The page is the dev-only harness (capture-harness.html), part of the e2e build only.
import { expect, test, type Page, type Request } from '@playwright/test';
import type { DecodeReport, ScanReport } from '../src/capture/harness/harness';

const CODE = '3017620422003';
const OFF_HOST = 'world.openfoodfacts.org';
const OFF_FIELDS = 'product_name,product_name_en,generic_name,brands,categories_tags';

interface OffSeen {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
}

/** Answer OFF locally (with CORS) and record exactly what the browser would have sent. */
async function mockOff(page: Page): Promise<OffSeen[]> {
  const seen: OffSeen[] = [];
  await page.route(`https://${OFF_HOST}/**`, async (route) => {
    const request: Request = route.request();
    seen.push({
      url: request.url(),
      method: request.method(),
      headers: await request.allHeaders(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        status: 1,
        product: {
          product_name: 'Nutella',
          brands: 'Ferrero',
          categories_tags: ['en:spreads', 'en:sweet-spreads'],
        },
      }),
    });
  });
  return seen;
}

async function openHarness(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/capture-harness.html');
  await page.waitForFunction(() => document.documentElement.dataset['harness'] === 'ready');
  return errors;
}

test('zxing-wasm loads from the self-hosted path and decodes an EAN-13 still (no third-party host)', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  const errors = await openHarness(page);

  const report: DecodeReport = await page.evaluate(
    (code) => window.__captureHarness.decodeStill('zxing', code),
    CODE,
  );
  expect(report).toEqual({ decoder: 'zxing', codes: [CODE] });

  const zxing = requested.filter((u) => u.includes('zxing'));
  expect(zxing.map((u) => new URL(u).pathname).sort()).toEqual([
    '/zxing/3.1.1/reader.js',
    '/zxing/3.1.1/zxing_reader.wasm',
  ]);
  for (const url of requested) {
    const { hostname } = new URL(url);
    expect(['localhost', ''], url).toContain(hostname);
  }
  expect(errors).toEqual([]);
});

test('the reader and wasm are immutable-versioned files that the service worker precaches', async ({
  request,
}) => {
  const reader = await request.get('/zxing/3.1.1/reader.js');
  expect(reader.ok()).toBe(true);
  expect(await reader.text()).not.toContain('jsdelivr');
  const wasm = await request.get('/zxing/3.1.1/zxing_reader.wasm');
  expect(wasm.ok()).toBe(true);
  expect(wasm.headers()['content-type']).toContain('application/wasm');
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).toContain('zxing/3.1.1/reader.js');
  expect(sw).toContain('zxing/3.1.1/zxing_reader.wasm');
});

test('the fake camera plays a barcode clip: getUserMedia -> zxing -> scan flow -> OFF match', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'fake media stream is Chromium-only');
  const seen = await mockOff(page);
  const errors = await openHarness(page);

  const report: ScanReport = await page.evaluate(() =>
    window.__captureHarness.scanCamera('zxing', 'allowed'),
  );
  expect(report.decoder).toBe('zxing');
  expect(report.state).toMatchObject({
    kind: 'scanning',
    lookup: {
      kind: 'match',
      code: CODE,
      match: {
        food: { displayName: 'Nutella', sourceRef: CODE, source: 'off', foodGroup: 'other' },
      },
    },
  });
  expect(seen).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('the OFF request is exactly GET /api/v2/product/<barcode>?fields=... with no Referer, Cookie or Authorization', async ({
  page,
  context,
}) => {
  // A cookie for the OFF host: it must NOT be sent (credentials: omit).
  await context.addCookies([
    {
      name: 'session',
      value: 'secret',
      domain: OFF_HOST,
      path: '/',
      secure: true,
      sameSite: 'None',
    },
  ]);
  const seen = await mockOff(page);
  await openHarness(page);

  const result = await page.evaluate(
    (code) => window.__captureHarness.lookup(code, 'allowed'),
    CODE,
  );
  expect(result.kind).toBe('rankedMatches');

  expect(seen).toHaveLength(1);
  const only = seen[0]!;
  const url = new URL(only.url);
  expect(only.method).toBe('GET');
  expect(url.origin).toBe(`https://${OFF_HOST}`);
  expect(url.pathname).toBe(`/api/v2/product/${CODE}`);
  expect([...url.searchParams.keys()]).toEqual(['fields']);
  expect(url.searchParams.get('fields')).toBe(OFF_FIELDS);
  expect(url.hash).toBe('');

  const names = Object.keys(only.headers).map((h) => h.toLowerCase());
  expect(only.headers['accept']).toBe('application/json');
  for (const forbidden of ['referer', 'cookie', 'authorization', 'x-forwarded-for']) {
    expect(names, forbidden).not.toContain(forbidden);
  }
});

test('nothing is sent to OFF unless the stored answer is OK', async ({ page }) => {
  const seen = await mockOff(page);
  await openHarness(page);
  for (const choice of ['unasked', 'offlineOnly'] as const) {
    const result = await page.evaluate(([code, c]) => window.__captureHarness.lookup(code, c), [
      CODE,
      choice,
    ] as const);
    expect(result, choice).toEqual({ kind: 'notFound', query: CODE });
  }
  expect(seen).toHaveLength(0);
});

test('with the native BarcodeDetector (where this browser has one) the camera clip decodes too', async ({
  page,
}) => {
  const seen = await mockOff(page);
  await openHarness(page);
  const hasNative = await page.evaluate(() => 'BarcodeDetector' in globalThis);
  test.skip(!hasNative, 'this browser has no BarcodeDetector; the zxing path is covered above');
  const report: ScanReport = await page.evaluate(() =>
    window.__captureHarness.scanCamera('native', 'allowed'),
  );
  expect(report.decoder).toBe('native');
  expect(report.state).toMatchObject({ kind: 'scanning', lookup: { kind: 'match', code: CODE } });
  expect(seen).toHaveLength(1);
});
