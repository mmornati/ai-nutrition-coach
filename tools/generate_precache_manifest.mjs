#!/usr/bin/env node
// tools/generate_precache_manifest.mjs — the build step that turns the Vite release bundle into an
// offline-capable one (ADR-0003). A node port of the earlier generator.
//
//   node tools/generate_precache_manifest.mjs [<web-dir>] [--build-id <id>]
//
// Run on `apps/web/dist` (the default) AFTER `vite build` (`pnpm build` and infra/Dockerfile do
// it). It writes two files next to `index.html`:
//
//   precache-manifest.json   { buildId, files: [ { url, sha256, size } ] }
//   sw.js                    tools/pwa/sw.template.js with the build id baked in, so the worker's
//                            BYTES change whenever any shipped file changes -- that is what makes
//                            the browser notice a new version.
//
// Both are generated, never committed. The service worker precaches exactly the manifest's files
// (verifying each SHA-256) under a cache named after the build id. Vite's output is content-hashed
// (`assets/index-<hash>.js`), so the file list, and with it the id, changes with every code change.
//
// What is precached: every file in the bundle (index.html, the hashed JS/CSS chunks including the
// store worker, the web manifest, icons, fonts, licences, the versioned sqlite3mc engine and the
// self-hosted zxing decoder and the Argon2id build). Not precached: source maps, dotfiles and the two generated files.
//
// The generator REFUSES to produce a worker for a bundle that cannot boot offline: it must contain
// the document, the web manifest, the boot guard, every local script/stylesheet/module the document
// references, the store worker chunk, and the sqlite3mc, zxing and Argon2id assets.
//
// The build id is a hash of the file list + hashes (deterministic: the same bundle always gets the
// same id) unless `--build-id` / AI_NUTRITION_COACH_BUILD_ID is given -- the way to force "a new
// version" in a test.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Files the generator writes itself (never listed in the manifest). */
export const GENERATED_FILES = new Set(['sw.js', 'precache-manifest.json']);

const BUILD_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const BUILD_ID_MARKER = '__AI_NUTRITION_COACH_BUILD_ID__';

/** True when [path] (relative, `/`-separated) must NOT be precached. */
export function isExcludedFromPrecache(path) {
  if (GENERATED_FILES.has(path)) return true;
  if (path.startsWith('.') || path.includes('/.')) return true;
  if (path.endsWith('.map')) return true;
  return false;
}

const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walk(full);
    else if (stat.isFile()) yield full;
  }
}

/** Every precacheable file under [webDir], sorted by url. */
export function collectPrecacheEntries(webDir) {
  const entries = [];
  for (const file of walk(webDir)) {
    const url = relative(webDir, file).split(sep).join('/');
    if (isExcludedFromPrecache(url)) continue;
    const bytes = readFileSync(file);
    entries.push({ url, sha256: sha256Hex(bytes), size: bytes.length });
  }
  return entries.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

/** Files the app cannot boot without, by exact name. */
export const REQUIRED_FILES = ['index.html', 'manifest.webmanifest', 'boot-guard.js'];

/** Files the app cannot boot without, by shape (their names carry a hash or a version). */
export const REQUIRED_PATTERNS = [
  { label: 'the store worker chunk (assets/store.worker-*.js)', re: /^assets\/store\.worker-[^/]+\.js$/ },
  { label: 'sqlite3mc/<ver>/sqlite3.mjs', re: /^sqlite3mc\/[0-9][0-9.]*\/sqlite3\.mjs$/ },
  { label: 'sqlite3mc/<ver>/sqlite3.wasm', re: /^sqlite3mc\/[0-9][0-9.]*\/sqlite3\.wasm$/ },
  { label: 'zxing/<ver>/reader.js', re: /^zxing\/[0-9][0-9.]*\/reader\.js$/ },
  { label: 'zxing/<ver>/zxing_reader.wasm', re: /^zxing\/[0-9][0-9.]*\/zxing_reader\.wasm$/ },
  { label: 'argon2/<ver>/argon2.umd.min.js', re: /^argon2\/[0-9][0-9.]*\/argon2\.umd\.min\.js$/ },
];

/** Same-origin files index.html loads (`src=` / `href=` starting with one `/`), query stripped. */
export function localReferences(html) {
  const refs = new Set();
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    for (const attr of tag[0].matchAll(/\b(?:src|href)\s*=\s*"([^"]*)"/gi)) {
      const value = attr[1];
      if (!value.startsWith('/') || value.startsWith('//')) continue;
      refs.add(value.slice(1).split(/[?#]/)[0]);
    }
  }
  return [...refs].filter(Boolean);
}

/** Missing required files (empty = fine). `indexHtml` is the document's text, if present. */
export function missingRequiredFiles(entries, indexHtml = '') {
  const have = new Set(entries.map((e) => e.url));
  const missing = REQUIRED_FILES.filter((f) => !have.has(f));
  for (const { label, re } of REQUIRED_PATTERNS) {
    if (![...have].some((u) => re.test(u))) missing.push(label);
  }
  // The document must load an application script and a stylesheet (their names are hashed).
  if (!/<script\b[^>]*\btype="module"[^>]*\bsrc="\/[^"]+"/i.test(indexHtml)) {
    missing.push('the entry module script in index.html');
  }
  if (!/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="\/[^"]+"/i.test(indexHtml)) {
    missing.push('the entry stylesheet in index.html');
  }
  for (const ref of localReferences(indexHtml)) {
    if (!have.has(ref)) missing.push(`${ref} (referenced by index.html)`);
  }
  return missing;
}

/** A deterministic id of this exact set of files. */
export function computeBuildId(entries) {
  const sorted = [...entries].sort((a, b) => (a.url < b.url ? -1 : 1));
  const text = sorted.map((e) => `${e.url}:${e.sha256}`).join('\n');
  return sha256Hex(Buffer.from(text, 'utf8')).slice(0, 16);
}

/** The manifest document. */
export function renderManifest(buildId, entries) {
  const files = entries.map(({ url, sha256, size }) => ({ url, sha256, size }));
  return `${JSON.stringify({ buildId, files }, null, 2)}\n`;
}

/** The service worker source for [buildId]. */
export function renderServiceWorker(template, buildId) {
  if (!BUILD_ID_PATTERN.test(buildId)) {
    throw new RangeError(`buildId must match ${BUILD_ID_PATTERN}: ${JSON.stringify(buildId)}`);
  }
  if (!template.includes(BUILD_ID_MARKER)) {
    throw new Error('the service worker template has no build-id marker');
  }
  return template.replaceAll(BUILD_ID_MARKER, buildId);
}

/**
 * Generates `precache-manifest.json` and `sw.js` into [webDir]. Returns the build id. Throws on a
 * bundle that cannot boot (and then writes nothing).
 */
export function generate({ webDir, template, buildIdOverride }) {
  if (!existsSync(webDir)) throw new Error(`${webDir} does not exist - build the web bundle first.`);
  const entries = collectPrecacheEntries(webDir);
  const indexPath = join(webDir, 'index.html');
  const indexHtml = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
  const missing = missingRequiredFiles(entries, indexHtml);
  if (missing.length > 0) throw new Error(`the bundle lacks ${missing.join(', ')}`);
  const buildId = buildIdOverride || computeBuildId(entries);
  const sw = renderServiceWorker(template, buildId);
  writeFileSync(join(webDir, 'precache-manifest.json'), renderManifest(buildId, entries));
  writeFileSync(join(webDir, 'sw.js'), sw);
  return buildId;
}

function main(argv) {
  let webPath;
  let buildId = process.env['AI_NUTRITION_COACH_BUILD_ID'] || undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--build-id' && i + 1 < argv.length) buildId = argv[++i];
    else if (arg.startsWith('-')) {
      console.error('usage: generate_precache_manifest.mjs [<web-dir>] [--build-id <id>]');
      return 2;
    } else webPath = arg;
  }
  const webDir = webPath ?? join(here, '..', 'apps', 'web', 'dist');
  try {
    const template = readFileSync(join(here, 'pwa', 'sw.template.js'), 'utf8');
    const id = generate({ webDir, template, buildIdOverride: buildId });
    console.log(
      `precache: ${collectPrecacheEntries(webDir).length} files, build id ${id} -> ${webDir}/sw.js`,
    );
    return 0;
  } catch (e) {
    console.error(`precache: FAIL - ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
