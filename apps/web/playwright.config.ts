import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ean13Y4m } from './src/barcode/ean13-fixture';

// CI installs the bundled chromium (`playwright install --with-deps chromium`).
// Locally, PW_CHANNEL=chrome drives the installed Google Chrome instead.
// PW_WEBKIT=1 adds a WebKit project (needs `playwright install webkit`).
const channel = process.env['PW_CHANNEL'] === 'chrome' ? 'chrome' : undefined;

// The e2e server serves a SEPARATE build that includes the dev gallery (VITE_GALLERY=1) and the
// encrypted-store harness page (VITE_STORAGE_HARNESS=1), so the release build in dist/ stays free
// of both (tools/check_no_gallery_in_build.sh and tools/check_no_dev_store_in_build.sh guard that).
const E2E_OUT = 'dist-e2e';

// Chromium's fake camera plays a generated clip of a real EAN-13 (Nutella, 3017620422003), so the
// capture e2e drives getUserMedia -> decoder -> scan flow end to end without hardware.
export const FAKE_CAMERA_CODE = '3017620422003';
const cameraDir = join(tmpdir(), 'anc-e2e-camera');
mkdirSync(cameraDir, { recursive: true });
const fakeCameraClip = join(cameraDir, `ean13-${FAKE_CAMERA_CODE}.y4m`);
writeFileSync(fakeCameraClip, ean13Y4m(FAKE_CAMERA_CODE));

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
      use: {
        ...devices['Desktop Chrome'],
        ...(channel ? { channel } : {}),
        permissions: ['camera'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${fakeCameraClip}`,
          ],
        },
      },
    },
    ...(process.env['PW_WEBKIT']
      ? [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }]
      : []),
  ],
});
