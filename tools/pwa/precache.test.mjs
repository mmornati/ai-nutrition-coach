// The precache-manifest generator, the build-id render step and the kill switch
// (port of the earlier client). Run by vitest (project
// `tools` in apps/web/vitest.config.ts). The worker's own behaviour is in sw.behaviour.test.mjs.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectPrecacheEntries,
  computeBuildId,
  generate,
  isExcludedFromPrecache,
  localReferences,
  missingRequiredFiles,
  renderServiceWorker,
} from '../generate_precache_manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const template = readFileSync(join(root, 'tools/pwa/sw.template.js'), 'utf8');
const INDEX = `<!doctype html><html><head>
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="icon" href="/favicon.svg" />
<link rel="stylesheet" crossorigin href="/assets/index-AAA.css" />
<link rel="preload" href="https://cdn.example/x.woff2" as="font" />
<script src="/boot-guard.js" defer></script>
<script type="module" crossorigin src="/assets/index-AAA.js"></script>
</head><body><div id="root"></div></body></html>`;

let web;
const write = (path, body = 'x') => {
  const full = join(web, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
};

function bundle() {
  write('index.html', INDEX);
  write('manifest.webmanifest', '{}');
  write('boot-guard.js', 'guard');
  write('favicon.svg', '<svg/>');
  write('assets/index-AAA.js', 'js');
  write('assets/index-AAA.css', 'css');
  write('assets/store.worker-BBB.js', 'worker');
  write('sqlite3mc/2.5.1/sqlite3.mjs', 'mjs');
  write('sqlite3mc/2.5.1/sqlite3.wasm', 'wasm');
  write('zxing/3.1.1/reader.js', 'zx');
  write('zxing/3.1.1/zxing_reader.wasm', 'zxwasm');
  write('icons/icon-192.png', 'png');
  // Never precached:
  write('assets/index-AAA.js.map', 'map');
  write('.DS_Store', 'junk');
}

beforeEach(() => {
  web = mkdtempSync(join(tmpdir(), 'anc-precache-'));
  bundle();
});
afterEach(() => rmSync(web, { recursive: true, force: true }));

describe('what is precached', () => {
  it('everything needed to boot offline, nothing else', () => {
    expect(collectPrecacheEntries(web).map((e) => e.url)).toEqual([
      'assets/index-AAA.css',
      'assets/index-AAA.js',
      'assets/store.worker-BBB.js',
      'boot-guard.js',
      'favicon.svg',
      'icons/icon-192.png',
      'index.html',
      'manifest.webmanifest',
      'sqlite3mc/2.5.1/sqlite3.mjs',
      'sqlite3mc/2.5.1/sqlite3.wasm',
      'zxing/3.1.1/reader.js',
      'zxing/3.1.1/zxing_reader.wasm',
    ]);
  });

  it('records the SHA-256 and size of each file', () => {
    write('icons/icon-192.png', 'abc');
    const e = collectPrecacheEntries(web).find((x) => x.url === 'icons/icon-192.png');
    expect(e.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(e.size).toBe(3);
  });

  it('the generated files are never listed (so regenerating is stable)', () => {
    const first = generate({ webDir: web, template });
    expect(existsSync(join(web, 'sw.js'))).toBe(true);
    expect(existsSync(join(web, 'precache-manifest.json'))).toBe(true);
    expect(generate({ webDir: web, template })).toBe(first);
    const manifest = JSON.parse(readFileSync(join(web, 'precache-manifest.json'), 'utf8'));
    const urls = manifest.files.map((f) => f.url);
    expect(urls).not.toContain('sw.js');
    expect(urls).not.toContain('precache-manifest.json');
    expect(manifest.buildId).toBe(first);
  });

  it('exclusion rules', () => {
    for (const p of ['sw.js', 'precache-manifest.json', '.x', 'a/.b', 'assets/x.js.map']) {
      expect(isExcludedFromPrecache(p), p).toBe(true);
    }
    expect(isExcludedFromPrecache('assets/index-AAA.js')).toBe(false);
  });
});

describe('a bundle that cannot boot is refused (and nothing is written)', () => {
  const refuse = (what) => {
    expect(() => generate({ webDir: web, template })).toThrow(what);
    expect(existsSync(join(web, 'sw.js'))).toBe(false);
    expect(existsSync(join(web, 'precache-manifest.json'))).toBe(false);
  };

  it.each([
    ['index.html', /index\.html/],
    ['manifest.webmanifest', /manifest\.webmanifest/],
    ['boot-guard.js', /boot-guard\.js/],
    ['assets/index-AAA.js', /index-AAA\.js \(referenced by index\.html\)/],
    ['assets/index-AAA.css', /index-AAA\.css \(referenced by index\.html\)/],
    ['assets/store.worker-BBB.js', /store worker/],
    ['sqlite3mc/2.5.1/sqlite3.wasm', /sqlite3\.wasm/],
    ['sqlite3mc/2.5.1/sqlite3.mjs', /sqlite3\.mjs/],
    ['zxing/3.1.1/zxing_reader.wasm', /zxing_reader\.wasm/],
    ['zxing/3.1.1/reader.js', /reader\.js/],
  ])('without %s', (file, what) => {
    rmSync(join(web, file));
    refuse(what);
  });

  it('with a file the document references missing', () => {
    write('index.html', INDEX.replace('/favicon.svg', '/not-there.svg'));
    refuse(/not-there\.svg \(referenced by index\.html\)/);
  });

  it('a document that loads no application script or stylesheet', () => {
    write('index.html', '<html><head></head><body></body></html>');
    refuse(/entry module script/);
    write('index.html', INDEX.replace(/<link rel="stylesheet"[^>]*>/, ''));
    refuse(/entry stylesheet/);
  });

  it('a missing directory', () => {
    expect(() => generate({ webDir: join(web, 'nope'), template })).toThrow(/does not exist/);
  });

  it('local references ignore cross-origin and protocol-relative URLs', () => {
    expect(localReferences(INDEX).sort()).toEqual(
      ['assets/index-AAA.css', 'assets/index-AAA.js', 'boot-guard.js', 'favicon.svg', 'manifest.webmanifest'].sort(),
    );
    expect(missingRequiredFiles(collectPrecacheEntries(web), INDEX)).toEqual([]);
  });
});

describe('build id', () => {
  it('is deterministic and changes when any file changes', () => {
    const a = computeBuildId(collectPrecacheEntries(web));
    expect(computeBuildId(collectPrecacheEntries(web))).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    write('assets/index-AAA.js', 'new code');
    const b = computeBuildId(collectPrecacheEntries(web));
    expect(b).not.toBe(a);
    write('icons/new.png', 'asset');
    expect(computeBuildId(collectPrecacheEntries(web))).not.toBe(b);
  });

  it('is baked into sw.js and equals the manifest build id; sw.js bytes change with the bundle', () => {
    const id = generate({ webDir: web, template });
    expect(readFileSync(join(web, 'sw.js'), 'utf8')).toContain(`const BUILD_ID = '${id}';`);
    const before = readFileSync(join(web, 'sw.js'), 'utf8');
    write('assets/index-AAA.js', 'a different build');
    generate({ webDir: web, template });
    expect(readFileSync(join(web, 'sw.js'), 'utf8')).not.toBe(before);
  });

  it('an explicit id forces a new version; unsafe ids are refused', () => {
    expect(generate({ webDir: web, template, buildIdOverride: 'test-2' })).toBe('test-2');
    expect(readFileSync(join(web, 'sw.js'), 'utf8')).toContain("const BUILD_ID = 'test-2';");
    for (const bad of ["';alert(1)//", '../x', '', 'a b', 'x'.repeat(65)]) {
      expect(() => renderServiceWorker(template, bad), bad).toThrow();
    }
  });

  it('the template has exactly one marker', () => {
    expect(template.split('__AI_NUTRITION_COACH_BUILD_ID__')).toHaveLength(2);
  });
});

describe('the CLI', () => {
  const run = (...args) =>
    spawnSync(process.execPath, [join(root, 'tools/generate_precache_manifest.mjs'), ...args], {
      encoding: 'utf8',
    });

  it('writes the files and exits 0; --build-id wins; a broken bundle exits 1', () => {
    const ok = run(web, '--build-id', 'cli-1');
    expect(ok.status, ok.stderr).toBe(0);
    expect(readFileSync(join(web, 'sw.js'), 'utf8')).toContain("'cli-1'");
    rmSync(join(web, 'boot-guard.js'));
    const bad = run(web);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('precache: FAIL');
    expect(run('--nope').status).toBe(2);
  });
});

describe('rendered at container start (30-render-sw.sh)', () => {
  let work;
  const script = join(root, 'infra/nginx/docker-entrypoint.d/30-render-sw.sh');

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'anc-render-'));
    mkdirSync(join(work, 'html'));
    mkdirSync(join(work, 'bin'));
    // macOS has shasum, not sha256sum (the image's busybox has it).
    writeFileSync(join(work, 'bin/sha256sum'), '#!/bin/sh\nexec shasum -a 256 "$@"\n');
    chmodSync(join(work, 'bin/sha256sum'), 0o755);
    writeFileSync(join(work, 'html/sw.js'), "'use strict';\nconst BUILD_ID = 'abc123';\nrest();\n");
    writeFileSync(
      join(work, 'html/precache-manifest.json'),
      '{\n  "buildId": "abc123",\n  "files": []\n}\n',
    );
    writeFileSync(join(work, 'headers.inc'), "add_header X 'a';\n");
  });
  afterEach(() => rmSync(work, { recursive: true, force: true }));

  const render = (env = {}) =>
    spawnSync('sh', [script], {
      encoding: 'utf8',
      env: {
        PATH: `${join(work, 'bin')}:${process.env['PATH']}`,
        AI_NUTRITION_COACH_PWA_SRC: join(work, 'html'),
        AI_NUTRITION_COACH_PWA_OUT: join(work, 'out'),
        AI_NUTRITION_COACH_HEADERS_FILE: join(work, 'headers.inc'),
        AI_NUTRITION_COACH_SW_KILL_FILE: join(root, 'tools/pwa/sw.kill.js'),
        ...env,
      },
    });
  const id = () => /const BUILD_ID = '([^']+)';/.exec(readFileSync(join(work, 'out/sw.js'), 'utf8'))[1];

  it('the id is the bundle id plus a hash of the headers, in sw.js AND the manifest', () => {
    const r = render();
    expect(r.status, r.stderr).toBe(0);
    expect(id()).toMatch(/^abc123-[0-9a-f]{12}$/);
    expect(readFileSync(join(work, 'out/precache-manifest.json'), 'utf8')).toContain(
      `"buildId": "${id()}"`,
    );
    expect(readFileSync(join(work, 'out/sw.js'), 'utf8')).toContain('rest();');
  });

  it('a changed Content-Security-Policy is a new service-worker version', () => {
    render();
    const before = id();
    render();
    expect(id()).toBe(before);
    writeFileSync(join(work, 'headers.inc'), "add_header X 'a https://api.example.com';\n");
    render();
    expect(id()).not.toBe(before);
    expect(id()).toMatch(/^abc123-/);
  });

  it('refuses to start on a bundle without a service worker', () => {
    rmSync(join(work, 'html/sw.js'));
    expect(render().status).not.toBe(0);
  });

  it('AI_NUTRITION_COACH_SW_KILL=1 serves the kill-switch worker and an empty manifest', () => {
    const r = render({ AI_NUTRITION_COACH_SW_KILL: '1' });
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(work, 'out/sw.js'), 'utf8')).toBe(
      readFileSync(join(root, 'tools/pwa/sw.kill.js'), 'utf8'),
    );
    expect(readFileSync(join(work, 'out/precache-manifest.json'), 'utf8')).toContain('"files": []');
  });

  it('works on the output of the real generator (marker format agrees with the sed)', () => {
    bundle();
    const real = generate({ webDir: web, template });
    writeFileSync(join(work, 'html/sw.js'), readFileSync(join(web, 'sw.js')));
    writeFileSync(join(work, 'html/precache-manifest.json'), readFileSync(join(web, 'precache-manifest.json')));
    expect(render().status).toBe(0);
    expect(id()).toMatch(new RegExp(`^${real}-[0-9a-f]{12}$`));
  });
});

describe('kill switch (tools/pwa/sw.kill.js)', () => {
  const kill = readFileSync(join(root, 'tools/pwa/sw.kill.js'), 'utf8')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
    .join('\n');

  it('takes over at once, deletes every cache, reloads open windows', () => {
    expect(kill).toContain("addEventListener('install'");
    expect(kill).toContain('self.skipWaiting()');
    expect(kill).toContain("addEventListener('activate'");
    expect(kill).toContain('caches.delete(name)');
    expect(kill).toContain('self.clients.claim()');
    expect(kill).toContain('client.navigate(client.url)');
  });

  it('is inert otherwise: no fetch handler, no unregister (that loops), no URL', () => {
    expect(kill).not.toContain("'fetch'");
    expect(kill).not.toContain('unregister');
    expect(kill).not.toContain('http');
  });
});
