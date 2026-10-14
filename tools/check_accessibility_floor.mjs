#!/usr/bin/env node
// Accessibility floor gate (port of tools/check_accessibility_floor.dart; plan phase 9 gate).
//
// Every screen component under apps/web/src/screens/** must be exercised by a test that runs axe
// (vitest-axe: accessible names, roles, contrast where jsdom can compute it) and asserts no
// violations. A new screen without one fails `pnpm verify`.
//
// "Exercised" means: some test block (`it` / `test` / `it.each`, never skipped) calls `axe(` and
// asserts `toHaveNoViolations()`, and the test FILE that holds it refers to the component by name
// (JSX, a describe title or an import). Comments and string contents are not searched for the
// `axe(` call itself. A component that is only ever rendered INSIDE another screen (a layout
// helper, a sheet body) may be listed in COVERED_BY with the screen that hosts it; the host must
// itself be covered, and a stale entry (the component no longer exists) fails. A component with
// nothing to measure (a decorative diagram) may be listed in EXEMPT with a reason.
//
// Light and dark: the app has ONE theme, dark (no light theme exists; see docs/accessibility.md),
// so there is a single contrast context to measure.
//
//   node tools/check_accessibility_floor.mjs            check the repository
//   node tools/check_accessibility_floor.mjs --root X   check another checkout (used by the self-test)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Component name -> the screen that renders it (which must itself be covered). */
export const COVERED_BY = Object.freeze({
  // Settings: building blocks rendered only inside the settings screens.
  SettingsPage: 'SettingsScreen',
  Section: 'SettingsScreen',
  Prose: 'SettingsScreen',
  ChoiceGroup: 'YourDataScreen',
  SwitchRow: 'YourAiScreen',
  SettingsList: 'SettingsScreen',
  // The log flows: sheets and views rendered by the host, and tested through it.
  TypeIt: 'LogHost',
  TypeItSheet: 'LogHost',
  BarcodeScan: 'LogHost',
  BarcodeSheet: 'LogHost',
  SnapSheet: 'LogHost',
  PhotoDeniedSheet: 'LogHost',
  // Part of the Today and Plate screens.
  PlateCoach: 'TodayScreen',
  // The frame of the gate screens.
  GateFrame: 'UnlockScreen',
});

/** Component name -> why there is nothing to measure. */
export const EXEMPT = Object.freeze({
  LineDiagram: 'decorative svg, aria-hidden; the screens that hold it are measured',
});

const COMPONENT =
  /export\s+(?:async\s+)?function\s+([A-Z]\w*)|export\s+const\s+([A-Z][a-z]\w*)\s*[:=]/g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'node_modules') continue;
      out.push(...walk(path));
    } else out.push(path);
  }
  return out;
}

/** Index just past the `)` that closes the `(` at `open`, skipping strings, templates and comments. */
function closeParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      i = text.indexOf('\n', i);
      if (i < 0) return text.length;
    } else if (c === '/' && next === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      if (i <= 0) return text.length;
    } else if (c === "'" || c === '"' || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i + 1;
  }
  return text.length;
}

/** `[start, end)` of every non-skipped `it(` / `test(` / `it.each(...)(` call. */
function testCalls(text) {
  const spans = [];
  const start = /\b(?:it|test)(\.each\s*\()?/g;
  for (let m = start.exec(text); m !== null; m = start.exec(text)) {
    if (text[m.index - 1] === '.') continue; // `x.it(`, `describe.skip`-style member calls
    let open = m.index + m[0].length;
    if (m[1] !== undefined) {
      // it.each(table)(name, fn): skip the table, then the call itself.
      open = closeParen(text, open - 1);
      while (/\s/.test(text[open] ?? '')) open++;
    }
    if (text[open] !== '(') continue;
    spans.push([m.index, closeParen(text, open)]);
  }
  return spans;
}

/** The text with `//` and block comments blanked (strings are kept as they are). */
function stripComments(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end - 1;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (c === "'" || c === '"' || c === '`') {
      const from = i;
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
      out += text.slice(from, i + 1);
    } else out += c;
  }
  return out;
}

/** True when some test block calls `axe(` and asserts `toHaveNoViolations`. */
export function hasAxeTest(source) {
  const text = stripComments(source);
  return testCalls(text).some(([from, to]) => {
    const block = text.slice(from, to);
    return /\baxe\s*\(/.test(block) && /toHaveNoViolations\s*\(/.test(block);
  });
}

/**
 * @param {{ root?: string, coveredBy?: Record<string, string>, exempt?: Record<string, string> }} [options]
 * @returns {{ components: { name: string, file: string, status: string, by?: string }[], problems: string[] }}
 */
export function checkAccessibilityFloor({
  root = resolve(fileURLToPath(import.meta.url), '../..'),
  coveredBy = COVERED_BY,
  exempt = EXEMPT,
} = {}) {
  const src = join(root, 'apps/web/src');
  const files = walk(src);
  const isTest = (f) => /\.test\.tsx?$/.test(f);

  const components = [];
  for (const file of files.filter(
    (f) => f.startsWith(join(src, 'screens')) && f.endsWith('.tsx') && !isTest(f),
  )) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(COMPONENT)) {
      components.push({ name: m[1] ?? m[2], file: relative(root, file) });
    }
  }

  const axeTests = files
    .filter((f) => isTest(f) && f.endsWith('.tsx'))
    .map((f) => ({ file: f, text: readFileSync(f, 'utf8') }))
    .filter(({ text }) => /from\s+['"]vitest-axe['"]/.test(text) && hasAxeTest(text));

  const directlyCovered = (name) =>
    axeTests.find(({ text }) => new RegExp(`\\b${name}\\b`).test(text));

  const problems = [];
  const names = new Set(components.map((c) => c.name));
  for (const name of [...Object.keys(coveredBy), ...Object.keys(exempt)]) {
    if (!names.has(name))
      problems.push(`stale allow-list entry: ${name} is not a screens/** component`);
  }
  for (const c of components) {
    if (Object.hasOwn(exempt, c.name)) {
      c.status = 'exempt';
    } else if (directlyCovered(c.name)) {
      c.status = 'covered';
    } else if (Object.hasOwn(coveredBy, c.name)) {
      const host = coveredBy[c.name];
      if (directlyCovered(host)) {
        c.status = 'covered';
        c.by = host;
      } else {
        c.status = 'missing';
        problems.push(`${c.name} (${c.file}) relies on ${host}, which has no axe test`);
      }
    } else {
      c.status = 'missing';
      problems.push(
        `${c.name} (${c.file}) has no axe test: add an it() that renders it, calls axe() and asserts toHaveNoViolations()`,
      );
    }
  }
  return { components, problems };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootFlag = process.argv.indexOf('--root');
  const root = rootFlag > 0 ? resolve(process.argv[rootFlag + 1]) : undefined;
  const { components, problems } = checkAccessibilityFloor(root ? { root } : {});
  if (problems.length > 0) {
    console.error('check_accessibility_floor: FAILED');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `check_accessibility_floor: ok (${components.length} screen components, ` +
      `${components.filter((c) => c.status === 'covered').length} covered by an axe test, ` +
      `${components.filter((c) => c.status === 'exempt').length} exempt)`,
  );
}
