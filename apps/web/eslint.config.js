import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import { telemetryMessage, telemetryPatterns } from '../../eslint.restrictions.js';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'playwright-report', 'test-results'] },
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
    // Tooling files run in Node, not the browser.
    files: ['vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
