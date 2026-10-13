import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import config from '../eslint.config.js';

async function ruleIds(code: string): Promise<string[]> {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config });
  const [result] = await eslint.lintText(code, { filePath: 'src/fixture.ts' });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'parse-error');
}

describe('AD-1 lint rules (packages/core must stay pure)', () => {
  it.each([
    ["import React from 'react';\nexport const x = React;", 'no-restricted-imports'],
    [
      "import { createRoot } from 'react-dom/client';\nexport const x = createRoot;",
      'no-restricted-imports',
    ],
    ["import { openDB } from 'idb';\nexport const x = openDB;", 'no-restricted-imports'],
    [
      "import * as Sentry from '@sentry/browser';\nexport const x = Sentry;",
      'no-restricted-imports',
    ],
    ['export const x = window.location;', 'no-restricted-globals'],
    ["export const x = localStorage.getItem('k');", 'no-restricted-globals'],
    ["export const x = () => fetch('/');", 'no-restricted-globals'],
    ['export const x = navigator.onLine;', 'no-restricted-globals'],
    ["export const x = () => globalThis.fetch('x');", 'no-restricted-properties'],
    ['export const x = globalThis.localStorage;', 'no-restricted-properties'],
    ['export const x = self.indexedDB;', 'no-restricted-properties'],
  ])('flags %j', async (code, rule) => {
    expect(await ruleIds(code)).toContain(rule);
  });

  it('still allows globalThis.crypto (uuid-v4)', async () => {
    expect(await ruleIds('export const x = () => globalThis.crypto.randomUUID();')).toEqual([]);
  });

  it('accepts pure code', async () => {
    expect(await ruleIds('export const add = (a: number, b: number): number => a + b;')).toEqual(
      [],
    );
  });
});
