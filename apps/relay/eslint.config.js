import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { telemetryMessage, telemetryPatterns } from '../../eslint.restrictions.js';

// The relay stores ciphertext it cannot read and logs nothing about it: no console in the request
// path, no telemetry SDKs. It shares types with @anc/core and nothing with the web app.
export default tseslint.config(
  { ignores: ['dist'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@anc/web', '@anc/web/*', '**/apps/web/**'],
              message: 'The relay must not depend on the web app.',
            },
            { group: telemetryPatterns, message: telemetryMessage },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/main.ts'],
    rules: { 'no-console': 'error' },
  },
);
