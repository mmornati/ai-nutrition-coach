import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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

// The encrypted-backup relay (apps/relay) the sync spec talks to: a REAL relay process on its own port
// with a throw-away data directory. The preview server does not proxy to it; the spec routes the
// app's same-origin /sync/ requests to it (e2e/sync.spec.ts), so every other spec sees a server with
// no relay, exactly as a default self-host install does.
export const RELAY_PORT = 4174;
const relayData = mkdtempSync(join(tmpdir(), 'anc-e2e-relay-'));

// The specs that run on the real encrypted store (a shared site-data store on WebKit).
const STORE_SPECS = ['storage', 'language', 'french', 'pwa', 'journey', 'relog', 'backup', 'sync'];

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  webServer: [
    {
      command: `pnpm exec tsc -b && VITE_GALLERY=1 VITE_STORAGE_HARNESS=1 pnpm exec vite build --outDir ${E2E_OUT} --emptyOutDir && node ../../tools/generate_precache_manifest.mjs ${E2E_OUT} && pnpm exec vite preview --outDir ${E2E_OUT} --port 4173 --strictPort`,
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      command: `pnpm --filter @anc/relay build && node --disable-warning=ExperimentalWarning ../relay/dist/relay.mjs`,
      url: `http://127.0.0.1:${RELAY_PORT}/sync/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        SYNC_HOST: '127.0.0.1',
        SYNC_PORT: String(RELAY_PORT),
        SYNC_DATA_DIR: relayData,
        // Generous: one test makes many calls from one address.
        SYNC_RATE_IP: '10000',
        SYNC_RATE_HANDLE: '10000',
        SYNC_RATE_SIGNUP: '10000',
      },
    },
  ],
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
    // WebKit's persistent contexts share one site-data store (OPFS, IndexedDB, localStorage) for the
    // origin, whatever their profile directory, so two WebKit tests that use the real store at the
    // same time wipe each other's data. Every store-backed spec therefore runs in its own project,
    // chained one after the other (and after everything else), never beside another store spec.
    // (Chromium profiles are isolated.)
    ...(process.env['PW_WEBKIT']
      ? [
          {
            name: 'webkit',
            testIgnore: STORE_SPECS.map((n) => new RegExp(`${n}\\.spec\\.ts`)),
            use: { ...devices['Desktop Safari'] },
          },
          ...STORE_SPECS.map((n, i) => ({
            name: `webkit-${n}`,
            testMatch: new RegExp(`${n}\\.spec\\.ts`),
            dependencies: [i === 0 ? 'webkit' : `webkit-${STORE_SPECS[i - 1]}`],
            use: { ...devices['Desktop Safari'] },
          })),
        ]
      : []),
  ],
});
