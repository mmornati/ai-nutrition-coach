import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import i18next from 'eslint-plugin-i18next';
import { telemetryMessage, telemetryPatterns } from '../../eslint.restrictions.js';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-e2e',
      'dev-dist',
      'playwright-report',
      'test-results',
      // Vendored, SHA-256-pinned sqlite3mc wasm build (scripts/fetch_web_sqlite3mc.sh).
      'public/sqlite3mc',
      // Vendored, SHA-256-pinned zxing-wasm decoder (scripts/fetch_web_zxing_pwa.sh).
      'public/zxing',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: telemetryPatterns, message: telemetryMessage }] },
      ],
    },
  },
  {
    // i18n-literal gate: user-facing copy lives in src/i18n, never in JSX. Text nodes and the
    // accessible-name attributes are checked; tests, the dev gallery and e2e are exempt.
    files: [
      'src/*.tsx',
      'src/components/**/*.tsx',
      'src/screens/**/*.tsx',
      'src/capture/**/*.tsx',
      'src/barcode/**/*.tsx',
      'src/catalog/**/*.tsx',
    ],
    ignores: [
      '**/*.test.tsx',
      'src/main.tsx',
      'src/components/gallery/**',
      'src/components/**/testing.tsx',
    ],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'jsx-attributes': {
            include: ['aria-label', 'aria-description', 'title', 'alt', 'placeholder'],
          },
          words: { exclude: ['^[\\s\\d.,:;·•–—/|&()+\\-×…]*$'] },
        },
      ],
    },
  },
  {
    // Tooling files run in Node, not the browser.
    files: ['vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
