import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Strict CSP, injected into the production build only. `vite dev` needs inline
// scripts (HMR preamble) and websockets, so dev gets no CSP.
// Mirrors the nginx CSP (docs/migration/parity-checklist.md, Appendix A) as far as a <meta> tag
// allows. frame-ancestors, report-uri and sandbox are IGNORED in a meta element, and the other
// security headers (X-Frame-Options, COOP/CORP, Permissions-Policy, nosniff, Referrer-Policy) are
// header-only: nginx must set them (plan phase 8). The Open Food Facts and BYOK AI hosts are
// added to connect-src in the phases that introduce those network paths (5 and 6).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "media-src 'self' blob:",
  // The Open Food Facts host is the one allowed network host (the barcode lookup, after the
  // one-time notice); the BYOK AI endpoint is added in phase 6.
  "connect-src 'self' https://world.openfoodfacts.org",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
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
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
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
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'generateSW',
      injectRegister: false,
      manifest: {
        id: '/',
        name: 'AI Nutrition Coach',
        short_name: 'AI Nutrition',
        description: 'A quiet, offline-first plate-logging app.',
        theme_color: '#0E1A3A',
        background_color: '#0E1A3A',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell + fonts only. API / AI requests are NEVER runtime-cached.
        // Includes the sqlite3mc engine (`sqlite3mc/<version>/sqlite3.mjs` + `sqlite3.wasm`, ~1.5 MB)
        // and the store worker chunk, so the encrypted store works offline.
        globPatterns: ['**/*.{js,mjs,wasm,css,html,woff2,svg,png,webmanifest}'],
        runtimeCaching: [],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ai\//, /^\/relay\//],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
    }),
  ],
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
