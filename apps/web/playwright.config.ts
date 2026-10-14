import { defineConfig, devices } from '@playwright/test';

// CI installs the bundled chromium (`playwright install --with-deps chromium`).
// Locally, PW_CHANNEL=chrome drives the installed Google Chrome instead.
// PW_WEBKIT=1 adds a WebKit project (needs `playwright install webkit`).
const channel = process.env['PW_CHANNEL'] === 'chrome' ? 'chrome' : undefined;

// The e2e server serves a SEPARATE build that includes the dev gallery (VITE_GALLERY=1) and the
// encrypted-store harness page (VITE_STORAGE_HARNESS=1), so the release build in dist/ stays free
// of both (tools/check_no_gallery_in_build.sh and tools/check_no_dev_store_in_build.sh guard that).
const E2E_OUT = 'dist-e2e';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  webServer: {
    command: `pnpm exec tsc -b && VITE_GALLERY=1 VITE_STORAGE_HARNESS=1 pnpm exec vite build --outDir ${E2E_OUT} --emptyOutDir && pnpm exec vite preview --outDir ${E2E_OUT} --port 4173 --strictPort`,
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) },
    },
    ...(process.env['PW_WEBKIT']
      ? [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }]
      : []),
  ],
});
