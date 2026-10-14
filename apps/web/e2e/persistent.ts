// A Playwright `test` whose browser context is PERSISTENT. An ephemeral WebKit context (like
// Safari private browsing) refuses OPFS file handles, so the real encrypted store (and with it
// every screen past the "store unavailable" one) only runs in a persistent profile; see
// docs/adr/0005-web-encrypted-store.md. Chromium accepts either.
import { test as base } from '@playwright/test';

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
  page: async ({ context }, provide) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await provide(page);
  },
});

export { expect } from '@playwright/test';
