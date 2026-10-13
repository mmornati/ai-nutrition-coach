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
  "connect-src 'self'",
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
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
        runtimeCaching: [],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/ai\//, /^\/relay\//],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
    }),
  ],
  build: { target: 'es2023', sourcemap: false },
});
