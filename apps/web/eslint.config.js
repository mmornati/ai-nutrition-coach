import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import i18next from 'eslint-plugin-i18next';
import { telemetryMessage, telemetryPatterns } from '../../eslint.restrictions.js';

/**
 * JSX props that never carry copy. Every OTHER prop on a custom component is checked, as is code
 * inside it (an event handler), so a new `label=`, `hint=` or `onClick={() => setX('...')}` is
 * caught without being listed here. (Native tags are checked by the plugin for aria-label, title,
 * alt, placeholder and value, and by NO_COPY_IN below for the rest.)
 */
const NON_COPY_PROPS = [
  'className',
  'style',
  'key',
  'ref',
  'id',
  'role',
  'rel',
  'target',
  'htmlFor',
  'name',
  'type',
  'href',
  'src',
  'srcSet',
  'sizes',
  'width',
  'height',
  'viewBox',
  'data-.*',
  'aria-(?:labelledby|describedby|controls|owns|flowto|details|errormessage|activedescendant)',
];

/** Strings that are not copy by their shape (a regex is matched against the whole string). */
const WORDS = [
  // Punctuation, digits and symbols only.
  /^[\s\d.,:;·•–—/|&()+\-×…]*$/,
  // One token starting lower-case with no spaces: a union member, id, kebab fragment, key,
  // selector or id suffix ('closed', 'allHistory', '-msg', 'note:', '[data-x]'). A capitalised
  // word ('Loading') or any sentence is still copy.
  /^[a-z\-_:#.[\]=/][\w\-:#.[\]=/*]*$/,
];

/** Call targets whose string arguments are never copy. (The plugin's defaults, plus ours.) */
const CALLEES = [
  'i18n(ext)?',
  't',
  'require',
  'addEventListener',
  'removeEventListener',
  'postMessage',
  'getElementById',
  'dispatch',
  'commit',
  'includes',
  'indexOf',
  'endsWith',
  'startsWith',
  // Class names, developer errors (never shown), DOM queries and platform lookups.
  'cn',
  'clsx',
  '(?:Type|Range|Syntax)?Error',
  'querySelector(?:All)?',
  'closest',
  'matches',
  '(?:get|set|has|remove)Attribute',
  'matchMedia',
  'Symbol',
  'URL',
  'RegExp',
];

/**
 * What the plugin cannot see on a NATIVE tag (it checks only aria-label, title, alt, placeholder
 * and value there, and treats the rest of the tag, event handlers included, as code): the other
 * text-carrying aria attributes, and words handed to a state setter. A single lower-case token
 * (a union member such as 'closed') is not copy; a capitalised word or anything with a space is.
 */
const WORDS_SHAPE = '/\\s|^[A-Z]/';
const NO_COPY_IN = [
  {
    selector: `JSXAttribute[name.name=/^aria-(?:description|valuetext|roledescription|placeholder|braillelabel)$/] :matches(Literal[value=/\\S/], TemplateElement[value.raw=/\\S/])`,
    message: 'Words for assistive technology belong in src/i18n.',
  },
  {
    selector: `CallExpression[callee.name=/^set[A-Z]/] :matches(Literal[value=${WORDS_SHAPE}], TemplateElement[value.raw=${WORDS_SHAPE}])`,
    message: 'A string handed to a state setter is shown to the person: it belongs in src/i18n.',
  },
  {
    selector: `CallExpression[callee.property.name=/^set[A-Z]/] :matches(Literal[value=${WORDS_SHAPE}], TemplateElement[value.raw=${WORDS_SHAPE}])`,
    message: 'A string handed to a setter is shown to the person: it belongs in src/i18n.',
  },
];

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
    // i18n-literal gate: user-facing copy lives in src/i18n, never in a .tsx file. Mode 'all'
    // checks every string literal and template literal, not only JSX text: a ternary or template
    // child, `aria-label={'...'}`, a string prop on a custom component (see TEXT_PROPS) and a
    // literal handed to a setter for display are all flagged. What is NOT copy is ignored by
    // shape (WORDS) or by where it is used (CALLEES): a single lower-case token such as a union
    // member or an id, punctuation, class names inside cn(), developer errors, DOM selectors.
    // Tests, the dev gallery, e2e and main.tsx are exempt.
    // Every .tsx under src/ (screens, the app root, components, capture, barcode, catalog, the AI
    // context...): a new folder is covered the day it is created.
    files: ['src/**/*.tsx'],
    ignores: [
      '**/*.test.tsx',
      'src/main.tsx',
      'src/components/gallery/**',
      'src/components/**/testing.tsx',
      'src/app/testing.tsx',
    ],
    plugins: { i18next },
    rules: {
      'no-restricted-syntax': ['error', ...NO_COPY_IN],
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'all',
          'should-validate-template': true,
          // Props that carry words a person reads or hears. Everything else (className, id,
          // role, href, data-*, aria-live, aria-controls, variants...) is not copy.
          'jsx-attributes': { exclude: NON_COPY_PROPS },
          words: { exclude: WORDS },
          callees: { exclude: CALLEES },
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
