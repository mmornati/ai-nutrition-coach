// The CSP split, proven in a real browser against the built app served by `vite preview`:
//  - the built index.html carries a <meta> CSP with NO connect-src and NO default-src, so a
//    deployment's header (nginx, AI_NUTRITION_COACH_CONNECT_SRC_EXTRA) is the only thing that decides
//    where the page may connect (a meta and a header CSP are BOTH enforced, so a restrictive meta
//    could never be widened);
//  - the preview server sends the full Appendix A policy as a header, so connect-src is enforced
//    here too: Open Food Facts is allowed, any other origin is blocked.
import { expect, test } from '@playwright/test';

const OFF_ORIGIN = 'https://world.openfoodfacts.org';
const OTHER_ORIGIN = 'https://api.not-allowed.example';

test('the built index.html meta CSP restricts neither connect-src nor default-src', async ({
  request,
}) => {
  const html = await (await request.get('/')).text();
  const metas = [...html.matchAll(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/gi)];
  expect(metas).toHaveLength(1);
  const content = (/content="([^"]*)"/i.exec(metas[0]?.[0] ?? '')?.[1] ?? '').replaceAll(
    '&#39;',
    "'",
  );
  expect(content).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(content).toContain("object-src 'none'");
  expect(content).toContain("base-uri 'none'");
  expect(content).not.toMatch(/connect-src/);
  expect(content).not.toMatch(/default-src/);
});

test('the served header carries the full policy, with connect-src limited to self + OFF', async ({
  request,
}) => {
  const csp = (await request.get('/')).headers()['content-security-policy'] ?? '';
  expect(csp).toContain(`connect-src 'self' ${OFF_ORIGIN};`);
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toMatch(/connect-src[^;]*\bhttps:(\s|;|$)/);
});

test('a fetch to an origin outside connect-src is blocked; Open Food Facts is allowed', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'asserted on Chromium; the policy text is checked everywhere',
  );
  let otherReachedNetwork = false;
  await page.route(`${OFF_ORIGIN}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: '{"ok":true}',
    }),
  );
  await page.route(`${OTHER_ORIGIN}/**`, (route) => {
    otherReachedNetwork = true;
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      body: 'nope',
    });
  });
  await page.goto('/');

  const outcome = await page.evaluate(
    async ({ off, other }) => {
      const violations: string[] = [];
      document.addEventListener('securitypolicyviolation', (e) =>
        violations.push(e.violatedDirective),
      );
      const attempt = async (url: string): Promise<'ok' | 'blocked'> => {
        try {
          const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
          return r.ok ? 'ok' : 'blocked';
        } catch {
          return 'blocked';
        }
      };
      const offResult = await attempt(`${off}/api/v2/product/1`);
      const otherResult = await attempt(`${other}/v1/chat/completions`);
      await new Promise((r) => setTimeout(r, 50)); // violation events are queued
      return { offResult, otherResult, violations };
    },
    { off: OFF_ORIGIN, other: OTHER_ORIGIN },
  );

  expect(outcome.offResult).toBe('ok');
  expect(outcome.otherResult).toBe('blocked');
  expect(outcome.violations.some((v) => v.startsWith('connect-src'))).toBe(true);
  expect(otherReachedNetwork).toBe(false);
});
