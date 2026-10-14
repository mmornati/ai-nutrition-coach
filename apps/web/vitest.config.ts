import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Two projects. `dom` is the UI and everything that needs a browser-like global (jsdom). `storage`
// runs the encrypted-store tests in plain Node: the real sqlite3mc wasm engine (with real page
// encryption on its in-memory file system) cannot start under jsdom, and nothing in the store
// engine needs a DOM. Tests that DO need one live in src/storage/dom/ and run in `dom`.
const STORAGE_NODE = ['src/storage/*.test.ts', 'src/storage/!(dom)/**/*.test.ts'];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/test/pwa-register-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    css: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', ...STORAGE_NODE],
        },
      },
      {
        extends: true,
        test: {
          name: 'storage',
          environment: 'node',
          include: STORAGE_NODE,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
