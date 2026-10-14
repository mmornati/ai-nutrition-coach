// AD-1 invariant: packages/core must stay pure. This scans every file under src/ (comments
// stripped) and fails on any import or re-export of a framework, storage, HTTP or Node specifier.
// The ESLint rules (eslint.config.js) catch the same in the editor; this is the CI backstop.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(pkgRoot, 'src');

const FORBIDDEN_FRAGMENTS = [
  'react',
  'react-dom',
  'idb',
  'dexie',
  'sql.js',
  '@sqlite.org',
  'localforage',
  'workbox',
  'vite-plugin-pwa',
  'virtual:',
  'axios',
  'ky',
  'node-fetch',
  'undici',
  'zustand',
  'swr',
  'jsdom',
  'happy-dom',
  '@anc/web',
  'apps/',
  '@sentry',
  'posthog',
  'mixpanel',
  'node:',
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

/** Replaces comments with spaces (newlines kept) while leaving string literals untouched. */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    const next = source[i + 1];
    if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
    } else if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (ch === '"' || ch === "'" || ch === '`') {
      out += ch;
      i++;
      while (i < source.length && source[i] !== ch) {
        if (source[i] === '\\') {
          out += source[i] ?? '';
          i++;
        }
        out += source[i] ?? '';
        i++;
      }
      out += ch;
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** Every module specifier a file imports, re-exports or dynamically imports. */
export function specifiersOf(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"()]*?\bfrom\s*)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) found.push(m[1] as string);
  return found;
}

describe('AD-1: @anc/core purity', () => {
  const files = walk(srcDir);

  it('scans a non-trivial number of source files', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('src/ imports nothing but relative modules inside src/', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('.')) offenders.push(`${relative(pkgRoot, file)} -> ${spec}`);
      }
    }
    expect(offenders, `AD-1 violation:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('src/ has no forbidden import specifier fragments', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
        const bad = FORBIDDEN_FRAGMENTS.find(
          (f) => spec === f || spec.startsWith(`${f}/`) || spec.includes(f),
        );
        if (bad !== undefined) offenders.push(`${relative(pkgRoot, file)} -> ${spec} (${bad})`);
      }
    }
    expect(offenders, `AD-1 violation:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('relative imports stay inside src/', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const spec of specifiersOf(readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('.')) continue;
        const resolved = join(file, '..', spec);
        if (!resolved.startsWith(srcDir)) offenders.push(`${relative(pkgRoot, file)} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('src/ uses no default exports', () => {
    const offenders = files.filter((f) =>
      /\bexport\s+default\b/.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(offenders.map((f) => relative(pkgRoot, f))).toEqual([]);
  });

  it('package.json declares no runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(pkg['dependencies'] ?? {}).toEqual({});
  });

  it('the scanner itself catches hidden and re-exported forbidden specifiers', () => {
    expect(specifiersOf("import React from 'react';")).toEqual(['react']);
    expect(specifiersOf("import type { X } from 'idb';")).toEqual(['idb']);
    expect(specifiersOf("export * from 'dexie';")).toEqual(['dexie']);
    expect(specifiersOf("export { a } from './a';")).toEqual(['./a']);
    expect(specifiersOf("const m = await import('node:fs');")).toEqual(['node:fs']);
    expect(specifiersOf("import 'side-effect';")).toEqual(['side-effect']);
    // Comments are stripped before scanning, so a commented-out import is not a violation...
    expect(specifiersOf("// import x from 'react';\n/* import y from 'idb'; */")).toEqual([]);
    // ...but an import after a comment on the same line is still seen.
    expect(specifiersOf("/* c */ import x from 'react';")).toEqual(['react']);
    // Quotes inside strings do not confuse the stripper.
    expect(specifiersOf('const s = "// not a comment"; import z from \'zustand\';')).toEqual([
      'zustand',
    ]);
  });
});
