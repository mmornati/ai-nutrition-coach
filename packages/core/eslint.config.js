import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { telemetryMessage, telemetryPatterns } from '../../eslint.restrictions.js';

// AD-1: the core is pure. No framework, DOM, storage or network; I/O goes through ports
// implemented in apps/web.
const forbiddenImports = [
  {
    group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'react-*', '@types/react*'],
    message: 'AD-1: packages/core must not import a UI framework.',
  },
  {
    group: ['@anc/web', '@anc/web/*', 'apps/*', '**/apps/web/**'],
    message: 'AD-1: packages/core must not depend on the web app.',
  },
  {
    group: [
      'idb',
      'idb/*',
      'idb-keyval',
      'dexie',
      'dexie/*',
      'sql.js',
      'sql.js/*',
      '@sqlite.org/*',
      'localforage',
      'workbox',
      'workbox-*',
      'vite-plugin-pwa',
      'vite-plugin-pwa/*',
      'virtual:*',
    ],
    message: 'AD-1: storage and service-worker libraries belong behind ports in apps/web.',
  },
  {
    group: ['jsdom', 'happy-dom', '@testing-library/*', 'react-router*', 'zustand', 'swr'],
    message: 'AD-1: DOM-specific libraries are not allowed in the core.',
  },
  { group: telemetryPatterns, message: telemetryMessage },
];

const forbiddenGlobals = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'navigator',
  'location',
  'XMLHttpRequest',
  'WebSocket',
  'caches',
  'self',
].map((name) => ({
  name,
  message: `AD-1: "${name}" is an I/O or DOM global; reach it through a port implemented in apps/web.`,
}));

// `globalThis.fetch` and `self.fetch` reach the same I/O as the bare globals. `globalThis.crypto`
// stays allowed (util/uuid-v4.ts).
const forbiddenGlobalProperties = ['globalThis', 'self'].flatMap((object) =>
  forbiddenGlobals
    .map(({ name }) => name)
    .filter((name) => name !== 'self')
    .map((property) => ({
      object,
      property,
      message: `AD-1: "${object}.${property}" is an I/O or DOM global; reach it through a port implemented in apps/web.`,
    })),
);

export default tseslint.config(
  { ignores: ['dist'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-restricted-imports': ['error', { patterns: forbiddenImports }],
      'no-restricted-globals': ['error', ...forbiddenGlobals],
      'no-restricted-properties': ['error', ...forbiddenGlobalProperties],
    },
  },
);
