import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// CSP, two layers. A <meta> CSP and a header CSP are BOTH enforced and can only narrow each other,
// so the <meta> must never restrict anything a deployment may legitimately widen:
//  - the production <meta> carries only directives that are safe for every deployment (script
//    execution, plugins, base URI, form targets, workers). It has NO `default-src` (which
//    `connect-src` falls back to) and NO `connect-src`: the network allow-list is header-only
//    (nginx, `AI_NUTRITION_COACH_CONNECT_SRC_EXTRA` widens it for the BYOK AI endpoint).
//    frame-ancestors, report-uri and sandbox are ignored in a <meta> anyway, and the other
//    security headers are header-only too (plan phase 8).
//  - `vite dev` / `vite preview` send the FULL Appendix A policy as a response header
//    (docs/migration/parity-checklist.md), so connect-src is enforced there too with Open Food
//    Facts as the one allowed host. Dev adds only what HMR needs ('unsafe-inline' scripts for the
//    React refresh preamble, inline <style> for CSS HMR, ws:).
const OFF_ORIGIN = 'https://world.openfoodfacts.org';

export const META_CSP = [
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export const headerCsp = (opts: { dev: boolean }): string =>
  [
    "default-src 'self'",
    `script-src 'self' ${opts.dev ? "'unsafe-inline' " : ''}'wasm-unsafe-eval'`,
    // No 'unsafe-inline' in a release: the build ships its CSS as a file, and React's `style={}`
    // props are applied through the CSSOM (element.style), which style-src does not govern (only
    // `style=""` attributes parsed from markup and <style> elements are). Dev needs it for Vite's
    // HMR <style> injection. e2e fails on any style-src violation (e2e/persistent.ts).
    `style-src 'self'${opts.dev ? " 'unsafe-inline'" : ''}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    `connect-src 'self' ${OFF_ORIGIN}${opts.dev ? ' ws: wss:' : ''}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'anc-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: META_CSP },
          injectTo: 'head-prepend',
        },
      ],
    },
  };
}

// The encrypted-store test harness (storage-harness.html) is a dev/e2e page: it is a build input
// only when VITE_STORAGE_HARNESS=1 (the e2e server), never in a release build. See
// tools/check_no_dev_store_in_build.sh.
const harness = process.env['VITE_STORAGE_HARNESS'] === '1';

export default defineConfig({
  plugins: [react(), tailwindcss(), cspPlugin()],
  server: { headers: { 'Content-Security-Policy': headerCsp({ dev: true }) } },
  preview: {
    headers: { 'Content-Security-Policy': headerCsp({ dev: false }) },
    // scripts/run_local_web.sh --tunnel serves the release bundle through an ephemeral ngrok URL.
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', '.ngrok.io'],
  },
  // The store worker is a module worker (it dynamically imports the versioned engine).
  worker: { format: 'es' },
  build: {
    target: 'es2023',
    sourcemap: false,
    ...(harness
      ? {
          rollupOptions: {
            input: {
              main: fileURLToPath(new URL('./index.html', import.meta.url)),
              'storage-harness': fileURLToPath(new URL('./storage-harness.html', import.meta.url)),
              'capture-harness': fileURLToPath(new URL('./capture-harness.html', import.meta.url)),
            },
          },
        }
      : {}),
  },
});
