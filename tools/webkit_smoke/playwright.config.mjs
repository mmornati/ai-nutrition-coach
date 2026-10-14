// Real-browser smoke of the PRODUCTION IMAGE (docs/pwa.md "Browser smoke"). Run by
// scripts/webkit_smoke.sh inside the pinned Playwright image, sharing the server container's
// network namespace so the page is http://localhost:8080 -- a secure context, exactly like a phone
// browsing to the app over HTTPS. Chromium and WebKit run the same specs; the barcode step needs
// Chromium's fake camera.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';
import { writeBarcodeY4m } from './barcode-y4m.mjs';

export const EAN = '3017620422003';
const dir = join(tmpdir(), 'anc-smoke-camera');
mkdirSync(dir, { recursive: true });
export const CAMERA_CLIP = join(dir, `ean13-${EAN}.y4m`);
writeBarcodeY4m(CAMERA_CLIP, EAN);

const browsers = (process.env['BROWSERS'] || 'webkit,chromium').split(',').map((s) => s.trim());

export default defineConfig({
  testDir: '.',
  testMatch: 'smoke.spec.mjs',
  // The browsers share ONE origin (and WebKit shares site data between contexts), so nothing here
  // may run in parallel; each project's tests also depend on the previous ones (serial).
  workers: 1,
  fullyParallel: false,
  timeout: 240_000,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  use: { baseURL: process.env['BASE_URL'] || 'http://localhost:8080' },
  projects: browsers.map((name, i) => ({
    name,
    use: { browserName: name },
    // One browser after the other, never beside each other.
    dependencies: i === 0 ? [] : [browsers[i - 1]],
  })),
});
