// Self-test of tools/check_telemetry_claims.mjs: it must pass on this repository and FAIL on
// each kind of network transport, SDK, stale allow-list entry and unanchored doc claim.
import { afterEach, describe, expect, it } from 'vitest';
import {
  ALLOW_LIST,
  checkDocAnchors,
  isTelemetryPackage,
  lockfilePackages,
  runGate,
  scanRepo,
  scanSource,
} from '../check_telemetry_claims.mjs';
import { REPO, cleanup, makeTree, runCli } from './fixture.mjs';

afterEach(cleanup);
const kinds = (code, allow = []) => scanSource('apps/web/src/x.ts', code, { allow }).map((f) => f.kind);

describe('telemetry gate: this repository', () => {
  it('passes (allow-list intact, no SDK, docs anchored)', () => {
    expect(runGate(REPO)).toEqual([]);
  });
  it('every allow-listed file exists and holds only allowances it needs', () => {
    expect(scanRepo(REPO).filter((f) => f.kind === 'allow-list')).toEqual([]);
    expect(Object.keys(ALLOW_LIST).length).toBeGreaterThanOrEqual(3);
  });
});

describe('telemetry gate: network transports are findings', () => {
  it.each([
    ['fetch call', "await fetch('/x');"],
    ['fetch reference', 'const f = fetch;'],
    ['globalThis.fetch', "globalThis.fetch('/x');"],
    ['window.fetch', "window.fetch('/x');"],
    ['bracket access', "self['fetch']('/x');"],
    ['computed access on globalThis', 'const n = "fe"; globalThis[n + "tch"]("/x");'],
    ['XMLHttpRequest', 'const x = new XMLHttpRequest();'],
    ['WebSocket', "new WebSocket('wss://x.test');"],
    ['EventSource', "new EventSource('/s');"],
    ['sendBeacon', "navigator.sendBeacon('/b', 'x');"],
    ['sendBeacon by bracket', "navigator['sendBeacon']('/b');"],
    ['importScripts', "importScripts('https://x.test/a.js');"],
    ['axios import', "import axios from 'axios';"],
    ['node:https import', "import https from 'node:https';"],
    ['require of a network package', "const ws = require('ws');"],
    ['value import of the capped-fetch helper', "import { cappedFetch } from '../net/capped-fetch';"],
    ['re-export of the helper', "export { cappedFetch } from './net/capped-fetch';"],
  ])('%s', (_name, code) => {
    expect(kinds(code)).toContain('network');
  });

  it('shadow-free mentions are fine: a property called fetch, a type, a comment, a string', () => {
    expect(kinds('const o = { fetch: 1 }; o.fetch; type F = typeof fetch;')).toEqual([]);
    expect(kinds("// fetch(url)\nconst s = 'fetch(url) XMLHttpRequest';")).toEqual([]);
    expect(kinds("import type { FetchLike } from '../net/capped-fetch';")).toEqual([]);
    expect(kinds("import { type FetchLike } from '../net/capped-fetch';")).toEqual([]);
  });

  it('an allow-list entry suppresses network findings, never telemetry ones', () => {
    expect(kinds("await fetch('/x');", ['network'])).toEqual([]);
    expect(kinds("import * as S from '@sentry/browser'; await fetch('/x');", ['network', 'script', 'dynamic-import'])).toEqual(['telemetry']);
  });
});

describe('telemetry gate: script injection, runtime imports, workers', () => {
  it.each([
    ['createElement script', "document.createElement('script');"],
    ['createElement script (upper case)', "doc.createElement('SCRIPT');"],
    ['createElement with a computed tag', 'doc.createElement(tag);'],
    ['a JSX script tag', 'export const A = () => <script src="/a.js" />;'],
  ])('%s is a script finding', (_n, code) => {
    const path = code.includes('<script') ? 'apps/web/src/x.tsx' : 'apps/web/src/x.ts';
    expect(scanSource(path, code).map((f) => f.kind)).toContain('script');
  });
  it('createElement of a non-script tag is fine', () => {
    expect(kinds("document.createElement('canvas');")).toEqual([]);
  });
  it.each([
    ['a template URL', 'await import(`${base}/m.mjs`);'],
    ['a variable', 'await import(u);'],
    ['an absolute URL', "await import('https://cdn.test/m.js');"],
  ])('import() of %s is a finding', (_n, code) => {
    expect(kinds(code)).toContain('dynamic-import');
  });
  it('import() of a relative literal is fine', () => {
    expect(kinds("await import('./components/gallery');")).toEqual([]);
  });
  it.each([
    ['an absolute URL', "new Worker('https://evil.test/w.js');"],
    ['a variable', 'new Worker(u);'],
    ['a protocol-relative URL', "new Worker(new URL('//evil.test/w.js', import.meta.url));"],
    ['a SharedWorker of an absolute URL', "new SharedWorker('https://evil.test/w.js');"],
    ['a URL against another base', "new Worker(new URL('./w.js', base));"],
  ])('a Worker of %s is a finding that no allow-list can silence', (_n, code) => {
    expect(kinds(code, ['network', 'script', 'dynamic-import'])).toContain('worker');
  });
  it('the same-origin worker form is fine', () => {
    expect(kinds("new Worker(new URL('./store.worker.ts', import.meta.url), { type: 'module' });")).toEqual([]);
  });
});

describe('telemetry gate: SDKs by prefix', () => {
  it.each(['@sentry/browser', 'posthog-js', 'mixpanel-browser', '@datadog/browser-rum', 'firebase', 'react-ga4', '@opentelemetry/api', 'logrocket', 'plausible-tracker'])(
    '%s is a telemetry package',
    (name) => expect(isTelemetryPackage(name)).toBe(true),
  );
  it.each(['react', 'vite', 'zxing-wasm', 'segment-tree', '@axe-core/playwright'])('%s is not', (name) =>
    expect(isTelemetryPackage(name)).toBe(false),
  );
  it('an import of an SDK is a finding in every file', () => {
    expect(kinds("import * as Sentry from '@sentry/react';")).toEqual(['telemetry']);
    expect(kinds("export * from 'posthog-js';")).toEqual(['telemetry']);
    expect(kinds("const s = await import('mixpanel-browser');")).toEqual(['telemetry']);
  });
  it('reads names out of a pnpm lockfile', () => {
    const lock = "packages:\n\n  '@sentry/core@8.0.0':\n    resolution: {}\n  react@19.3.0:\n    resolution: {}\n";
    expect(lockfilePackages(lock)).toEqual(['@sentry/core', 'react']);
  });
});

describe('telemetry gate: a checkout', () => {
  // Every allow-listed file exists and still needs what it holds, as in the real repository.
  const USES = {
    network: "export const f = () => fetch('/x');\n",
    script: "export const s = () => document.createElement('script');\n",
    'dynamic-import': 'export const d = (u: string) => import(u);\n',
  };
  const ALLOWED_FILES = Object.fromEntries(
    Object.entries(ALLOW_LIST).map(([path, e]) => [path, e.kinds.map((k) => USES[k]).join('')]),
  );
  const CLEAN = {
    ...ALLOWED_FILES,
    'apps/web/src/a.ts': 'export const a = 1;\n',
    'packages/core/src/b.ts': 'export const b = 2;\n',
    'package.json': '{"devDependencies":{"typescript":"5.9.3"}}',
    'apps/web/package.json': '{"dependencies":{"react":"19.3.0"}}',
    'docs/x.md': 'This page says no telemetry (see tools/check_telemetry_claims.mjs).',
  };
  it('a clean tree passes, as a CLI too (exit 0)', () => {
    const root = makeTree(CLEAN);
    expect(runGate(root)).toEqual([]);
    expect(runCli('check_telemetry_claims.mjs', root).code).toBe(0);
  });
  it('a violating source file fails the CLI with exit 1', () => {
    const root = makeTree({ ...CLEAN, 'apps/web/src/a.ts': "navigator.sendBeacon('/x');" });
    const r = runCli('check_telemetry_claims.mjs', root);
    expect(r.code).toBe(1);
    expect(r.out).toContain('sendBeacon');
  });
  it('a telemetry SDK in any package.json fails, whatever the kind of dependency', () => {
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const root = makeTree({ ...CLEAN, 'packages/core/package.json': JSON.stringify({ [key]: { '@sentry/browser': '1.0.0' } }) });
      expect(runGate(root).join('\n')).toContain('telemetry SDK dependency: @sentry/browser');
    }
  });
  it('a network package dependency fails (there is no adapter package to hold one)', () => {
    const root = makeTree({ ...CLEAN, 'apps/web/package.json': '{"dependencies":{"axios":"1.0.0"}}' });
    expect(runGate(root).join('\n')).toContain('network package dependency: axios');
  });
  it('an SDK that only arrives transitively (lockfile) fails', () => {
    const root = makeTree({ ...CLEAN, 'pnpm-lock.yaml': "packages:\n  'posthog-js@1.0.0':\n    resolution: {}\n" });
    expect(runGate(root).join('\n')).toContain('posthog-js');
  });
  it('a fetch outside the allow-list fails; inside it passes; a stale entry fails', () => {
    const files = { ...CLEAN, 'apps/web/src/adapter.ts': "export const g = () => fetch('/x');\n" };
    const root = makeTree(files);
    expect(scanRepo(root, {}).map((f) => f.path)).toContain('apps/web/src/adapter.ts');
    const allowed = { 'apps/web/src/adapter.ts': { kinds: ['network'], reason: 'test' } };
    expect(scanRepo(root, allowed).filter((f) => f.path.endsWith('adapter.ts'))).toEqual([]);
    // Missing file.
    const missing = { 'apps/web/src/gone.ts': { kinds: ['network'], reason: 'test' } };
    expect(scanRepo(root, missing).map((f) => f.message).join()).toContain('does not exist');
    // The adapter stops using the network: the allowance is stale and must be narrowed.
    const stale = makeTree({ ...CLEAN, 'apps/web/src/adapter.ts': 'export const g = 1;\n' });
    expect(scanRepo(stale, allowed).map((f) => f.message).join()).toContain('no longer needs');
    // Allowed for network only: script injection in the same file still fails.
    const mixed = makeTree({ ...CLEAN, 'apps/web/src/adapter.ts': "fetch('/x'); document.createElement('script');" });
    expect(
      scanRepo(mixed, allowed)
        .filter((f) => f.path.endsWith('adapter.ts'))
        .map((f) => f.kind),
    ).toEqual(['script']);
  });
  it('test files are not shipped code', () => {
    const root = makeTree({ ...CLEAN, 'apps/web/src/a.test.ts': "fetch('/x');", 'apps/web/src/test/setup.ts': "fetch('/x');" });
    expect(runGate(root)).toEqual([]);
  });
  it('a doc claiming "no telemetry" without the gate fails; the posture doc itself is exempt', () => {
    const root = makeTree({ ...CLEAN, 'docs/y.md': 'We ship NO TELEMETRY.', 'docs/telemetry-posture.md': 'No telemetry.' });
    const failures = checkDocAnchors(root);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('docs/y.md');
    // A top-level README is covered too.
    const readme = makeTree({ ...CLEAN, 'README.md': 'no telemetry at all' });
    expect(checkDocAnchors(readme).join()).toContain('README.md');
  });
});
