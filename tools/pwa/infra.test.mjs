// The self-host configuration, pinned (port of the Phase 4 / Phase 8 parts of
// packages/integrations/test/self_host_config_test.dart). The container itself is exercised by
// scripts/smoke_self_host.sh; these are the cheap static pins that run in `pnpm verify`.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { headerCsp } from '../../apps/web/vite.config';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const dockerfile = read('infra/Dockerfile');
const headers = read('infra/nginx/templates/ai-nutrition-coach-headers.inc.template');
const conf = read('infra/nginx/templates/ai-nutrition-coach.conf.template');
const compose = read('infra/docker-compose.yml');

const cspOf = (text) => /add_header Content-Security-Policy "([^"]*)"/.exec(text)[1];
const directive = (csp, name) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `));

describe('images', () => {
  it('every FROM is pinned by version AND digest', () => {
    const froms = [...dockerfile.matchAll(/^FROM (\S+)/gm)].map((m) => m[1]);
    expect(froms).toHaveLength(2);
    for (const from of froms) expect(from).toMatch(/^[a-z0-9./-]+:[0-9][^@\s]*@sha256:[0-9a-f]{64}$/);
    expect(froms[0]).toMatch(/^node:24\.\d+\.\d+-alpine3\.\d+@sha256:/);
    expect(froms[1]).toMatch(/^nginxinc\/nginx-unprivileged:/);
  });

  it('the build stage uses the repo pnpm, a strict lockfile and no Flutter', () => {
    const pm = /"packageManager": "pnpm@([0-9.]+)"/.exec(read('package.json'))[1];
    expect(dockerfile).toContain(`corepack prepare pnpm@${pm} --activate`);
    expect(dockerfile).toContain('pnpm install --frozen-lockfile');
    expect(dockerfile).not.toMatch(/flutter|dart|melos/i);
  });

  it('fetches the two pinned wasm assets BEFORE the sources are copied', () => {
    const fetchAt = dockerfile.indexOf('bash scripts/fetch_web_sqlite3mc.sh');
    expect(fetchAt).toBeGreaterThan(0);
    expect(dockerfile.indexOf('bash scripts/fetch_web_zxing_pwa.sh')).toBeGreaterThan(0);
    expect(fetchAt).toBeLessThan(dockerfile.indexOf('COPY apps/web apps/web'));
  });

  it('the image build fails on a leaked secret, a third-party host, the gallery or the dev store', () => {
    for (const check of [
      'check_no_secrets_in_build.sh',
      'check_no_external_hosts.sh',
      'check_no_gallery_in_build.sh',
      'check_no_dev_store_in_build.sh',
    ]) {
      expect(dockerfile).toMatch(new RegExp(`RUN bash tools/${check}|&& bash tools/${check}`));
    }
    expect(dockerfile).toContain('node tools/check_project_url.mjs');
  });

  it('the runtime stage is unprivileged, patched, health-checked and ships the kill switch', () => {
    expect(dockerfile).toMatch(/^USER 101$/m);
    expect(dockerfile).toContain('apk upgrade --no-cache');
    expect(dockerfile).toMatch(/HEALTHCHECK[^\n]*\\\n\s+CMD wget -q --spider http:\/\/127\.0\.0\.1:8080\//);
    expect(dockerfile).toContain('tools/pwa/sw.kill.js /etc/ai-nutrition-coach/sw.kill.js');
    expect(dockerfile).toContain('30-render-sw.sh');
    expect(dockerfile).toContain('COPY --from=build /work/apps/web/dist /usr/share/nginx/html');
  });
});

describe('the Content-Security-Policy', () => {
  const csp = cspOf(headers);

  it('has no inline script or style, no eval, no blanket https:, no CDN', () => {
    expect(directive(csp, 'script-src')).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expect(directive(csp, 'style-src')).toBe("style-src 'self'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(directive(csp, 'connect-src')).not.toMatch(/(^|\s)(https:|\*)(\s|$)/);
    expect(csp).not.toMatch(/https:\/\/(?!world\.openfoodfacts\.org)/);
  });

  it('connect-src is the one place the network is decided, with the CONNECT_SRC_EXTRA knob', () => {
    expect(directive(csp, 'connect-src')).toBe(
      "connect-src 'self' https://world.openfoodfacts.org ${AI_NUTRITION_COACH_CONNECT_SRC_EXTRA}",
    );
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  it('is the policy `vite preview` serves (one source of truth for dev, e2e and production)', () => {
    const nginx = csp.replace(' ${AI_NUTRITION_COACH_CONNECT_SRC_EXTRA}', '');
    expect(headerCsp({ dev: false })).toBe(nginx);
  });

  it('carries the other security headers', () => {
    for (const h of [
      'X-Content-Type-Options "nosniff"',
      'Referrer-Policy "no-referrer"',
      'X-Frame-Options "DENY"',
      'Permissions-Policy "camera=(self), microphone=(), geolocation=()"',
      'Cross-Origin-Opener-Policy "same-origin"',
      'Cross-Origin-Resource-Policy "same-origin"',
    ]) {
      expect(headers).toContain(`add_header ${h} always;`);
    }
  });
});

describe('nginx', () => {
  const locations = [...conf.matchAll(/^    location ([^{]+)\{([\s\S]*?)^    \}/gm)].map((m) => ({
    match: m[1].trim(),
    body: m[2],
  }));
  const cache = (needle) => locations.find((l) => l.match.includes(needle))?.body;

  it('serves nothing but GET/HEAD, no bodies, no proxying, no resolver', () => {
    expect(conf).toContain('if ($request_method !~ ^(GET|HEAD)$) { return 405; }');
    expect(conf).toContain('client_max_body_size 1k;');
    expect(`${conf}\n${read('infra/nginx/nginx.conf')}`).not.toMatch(
      /^\s*(proxy_pass|resolver|fastcgi_pass|uwsgi_pass|scgi_pass|grpc_pass)\b/m,
    );
    expect(read('infra/nginx/nginx.conf')).toContain('server_tokens off;');
  });

  it('every location re-includes the security headers (add_header is not inherited)', () => {
    expect(locations.length).toBeGreaterThanOrEqual(9);
    for (const l of locations) {
      expect(l.body, l.match).toContain('include /tmp/ai-nutrition-coach-headers.inc;');
    }
  });

  it("cache rules fit Vite's output", () => {
    expect(cache('index\\.html')).toContain('Cache-Control "no-cache"');
    expect(cache('manifest\\.webmanifest')).toContain('Cache-Control "no-cache"');
    expect(cache('boot-guard\\.js')).toContain('Cache-Control "no-cache"');
    expect(cache('= /sw.js')).toContain('Cache-Control "no-cache"');
    expect(cache('= /precache-manifest.json')).toContain('Cache-Control "no-cache"');
    expect(cache('= /sw.js')).toContain('alias /tmp/ai-nutrition-coach-pwa/sw.js;');
    for (const hashed of ['^~ /assets/', '/sqlite3mc/', '/zxing/']) {
      expect(cache(hashed), hashed).toContain('public, max-age=31536000, immutable');
      expect(cache(hashed), hashed).toContain('try_files $uri =404;');
    }
    expect(cache('(fonts|icons|licenses)')).toContain('max-age=300, must-revalidate');
  });

  it('a missing file is a real 404; only extension-less paths fall back to the shell', () => {
    expect(cache('\\.[A-Za-z0-9]+$')).toContain('try_files $uri =404;');
    expect(locations.at(-1).match).toBe('/');
    expect(locations.at(-1).body).toContain('try_files $uri /index.html;');
  });

  it('wasm and mjs have the right types and everything compressible is compressed', () => {
    expect(conf).toContain('text/javascript mjs;');
    expect(conf).toContain('application/manifest+json webmanifest;');
    expect(conf).toMatch(/gzip_types[^;]*application\/wasm[^;]*;/);
    expect(conf).toMatch(/gzip_types[^;]*text\/javascript[^;]*;/);
  });
});

describe('compose', () => {
  it('binds loopback by default, keeps the container hardened and holds no data', () => {
    expect(compose).toContain('127.0.0.1');
    expect(compose).toMatch(/read_only: true/);
    expect(compose).toContain("cap_drop: [ALL]");
    expect(compose).toContain('no-new-privileges:true');
    expect(compose).not.toContain('ai-nutrition-coach-data');
    expect(compose).toMatch(/image: caddy:[0-9][^\s@]*@sha256:[0-9a-f]{64}/);
  });
});
