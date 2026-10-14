// A Playwright `test` whose browser context is PERSISTENT. An ephemeral WebKit context (like
// Safari private browsing) refuses OPFS file handles, so the real encrypted store (and with it
// every screen past the "store unavailable" one) only runs in a persistent profile; see
// docs/adr/0005-web-encrypted-store.md. Chromium accepts either.
import { expect, test as base } from '@playwright/test';

export const test = base.extend({
  context: async ({ playwright, browserName, baseURL, channel }, provide, testInfo) => {
    const type = playwright[browserName];
    const context = await type.launchPersistentContext(testInfo.outputPath('profile'), {
      baseURL: baseURL ?? 'http://localhost:4173',
      ...(browserName === 'chromium' && channel ? { channel } : {}),
    });
    await provide(context);
    await context.close();
  },
  // Every test on this fixture also fails on a Content-Security-Policy violation other than a
  // deliberate connect-src one: the shipped policy has no 'unsafe-inline' for styles, so any inline
  // style the build needs would show up here as "Refused to apply inline style".
  page: async ({ context }, provide) => {
    const page = context.pages()[0] ?? (await context.newPage());
    const violations: string[] = [];
    // Primary detector: the browser's own `securitypolicyviolation` event, reported through an
    // exposed binding (independent of console wording, which differs between engines).
    await context.exposeBinding(
      '__ancReportCspViolation',
      (_source, directive: string, blocked: string) => {
        if (!directive.startsWith('connect-src'))
          violations.push(`${directive} blocked ${blocked}`);
      },
    );
    await context.addInitScript(() => {
      window.addEventListener('securitypolicyviolation', (e) => {
        const report = (window as unknown as Record<string, (d: string, b: string) => void>)
          .__ancReportCspViolation;
        report?.(e.violatedDirective, e.blockedURI || e.sample || '');
      });
    });
    // Secondary: console wording (also catches violations raised in workers).
    page.on('console', (m) => {
      const text = m.text();
      if (/Content Security Policy|Refused to/i.test(text) && !/connect-src/i.test(text)) {
        violations.push(text);
      }
    });
    await provide(page);
    expect(violations).toEqual([]);
  },
});

export { expect };
