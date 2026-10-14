// The self-host configuration, pinned (port of the Phase 4 / Phase 8 parts of
// the earlier client). The container itself is exercised by
// scripts/smoke_self_host.sh; these are the cheap static pins that run in `pnpm verify`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { headerCsp } from '../../apps/web/vite.config';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
// A file with comment lines removed, so a comment can never satisfy or break an assertion.
const readCode = (p) =>
  read(p)
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#') && !l.trimStart().startsWith('//'))
    .join('\n');
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

  it('the build stage uses the repo pnpm, and a strict lockfile', () => {
    const pm = /"packageManager": "pnpm@([0-9.]+)"/.exec(read('package.json'))[1];
    expect(dockerfile).toContain(`corepack prepare pnpm@${pm} --activate`);
    expect(dockerfile).toContain('pnpm install --frozen-lockfile');
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

describe('access log (privacy audit PV9)', () => {
  const script = join(root, 'infra/nginx/docker-entrypoint.d/10-render-access-log.sh');
  const PATH = process.env.PATH ?? '/usr/bin:/bin';

  // Runs the real POSIX-sh entrypoint script (no Docker needed).
  const render = (mode) => {
    const dir = mkdtempSync(join(tmpdir(), 'anc_log_'));
    try {
      const out = join(dir, 'log.inc');
      const env = { PATH, AI_NUTRITION_COACH_ACCESS_LOG_OUT: out };
      if (mode !== undefined) env.AI_NUTRITION_COACH_ACCESS_LOG = mode;
      const r = spawnSync('sh', [script], { env, encoding: 'utf8' });
      return { code: r.status, conf: existsSync(out) ? readFileSync(out, 'utf8') : '', err: r.stderr };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const logFormat = (conf) => /^log_format .*$/m.exec(conf)[0];

  it('nginx.conf logs nothing by itself: it only includes the rendered file', () => {
    const nginxConf = readCode('infra/nginx/nginx.conf');
    expect(nginxConf).toContain('include /tmp/ai-nutrition-coach-access-log.inc;');
    expect(nginxConf).not.toMatch(/^\s*access_log\b/m);
  });

  it('no nginx config, template or script ever logs the User-Agent, the Referer or the query string', () => {
    for (const f of [
      'infra/nginx/nginx.conf',
      'infra/nginx/templates/ai-nutrition-coach.conf.template',
      'infra/nginx/templates/ai-nutrition-coach-headers.inc.template',
      'infra/nginx/docker-entrypoint.d/10-render-access-log.sh',
    ]) {
      const text = readCode(f);
      expect(text, f).not.toContain('$http_user_agent');
      expect(text, f).not.toContain('$http_referer');
      expect(text, f).not.toContain('$request ');
    }
  });

  it('the image and both compose files default the mode to off', () => {
    const line = 'AI_NUTRITION_COACH_ACCESS_LOG: ${AI_NUTRITION_COACH_ACCESS_LOG:-off}';
    expect(dockerfile).toContain('AI_NUTRITION_COACH_ACCESS_LOG="off"');
    expect(dockerfile).toContain('10-render-access-log.sh');
    expect(compose).toContain(line);
    expect(read('infra/docker-compose.traefik.yml')).toContain(line);
  });

  it('unset, off or empty: access_log off, nothing else', () => {
    for (const mode of [undefined, 'off', '']) {
      const { code, conf } = render(mode);
      expect(code, `mode=${mode}`).toBe(0);
      expect(conf).toContain('access_log off;');
      expect(conf).not.toContain('log_format');
      expect(conf).not.toContain('/dev/stdout');
    }
  });

  it('on: truncated address, no User-Agent, no query string, no healthcheck lines', () => {
    const { code, conf } = render('on');
    expect(code).toBe(0);
    const format = logFormat(conf);
    expect(format).toContain('$ai_nutrition_coach_log_ip');
    expect(format).not.toContain('$remote_addr');
    expect(format).toContain('$uri');
    expect(format).not.toContain('$request ');
    expect(format).not.toContain('user_agent');
    expect(format).not.toContain('referer');
    expect(conf).toContain('if=$ai_nutrition_coach_loggable');
    expect(conf).toContain('\\.[0-9]+$"');
    expect(conf).toContain('$net.0;');
    expect(conf).toContain('$net::;');
    expect(conf).toContain('127.0.0.1  0;');
  });

  it('the address map keeps /24 for IPv4, at most /32 for IPv6, `::` for anything else', () => {
    const { conf } = render('on');
    // nginx regexes are PCRE with (?<name>...); JS spells a named group the same way.
    const rules = [...conf.matchAll(/^\s*"~(.+)"\s+\$net(\.0|::);/gm)].map((m) => [
      new RegExp(m[1]),
      m[2],
    ]);
    expect(rules).toHaveLength(2);
    const anon = (addr) => {
      for (const [re, suffix] of rules) {
        const hit = re.exec(addr);
        if (hit) return `${hit.groups.net}${suffix}`;
      }
      return '::';
    };
    expect(anon('192.168.97.45')).toBe('192.168.97.0');
    expect(anon('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8::');
    expect(anon('fe80:1:2:3:4:5:6:7')).toBe('fe80:1::');
    expect(anon('2001::1')).toBe('::'); // compressed: not recognised
    expect(anon('::1')).toBe('::');
    expect(anon('::ffff:192.0.2.1')).toBe('::');
    expect(anon('not an address')).toBe('::');
    expect(anon('2001:db8:85a3::1')).not.toContain('85a3');
    expect(conf).toContain('default');
  });

  it('full: the whole address is logged, still no User-Agent', () => {
    const { code, conf } = render('full');
    expect(code).toBe(0);
    expect(logFormat(conf)).toContain('$remote_addr');
    expect(logFormat(conf)).not.toContain('user_agent');
  });

  it('anything else refuses to start', () => {
    for (const bad of ['yes', 'ON', 'on; access_log /x', 'true']) {
      const { code, conf, err } = render(bad);
      expect(code, bad).toBe(1);
      expect(conf).toBe('');
      expect(err).toContain('AI_NUTRITION_COACH_ACCESS_LOG');
    }
  });

  it('bin/ai-nutrition-coach validates the mode before touching Docker (exit 42)', () => {
    const r = spawnSync('sh', [join(root, 'bin/ai-nutrition-coach'), 'up'], {
      env: { PATH, AI_NUTRITION_COACH_ACCESS_LOG: 'verbose' },
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(42);
    expect(r.stderr).toContain('AI_NUTRITION_COACH_ACCESS_LOG');
  });
});

describe('Traefik deployment (docs/pwa.md)', () => {
  const traefik = readCode('infra/docker-compose.traefik.yml');
  const certresolver = readCode('infra/docker-compose.traefik-certresolver.yml');
  const allowlist = readCode('infra/docker-compose.traefik-allowlist.yml');
  const dynamic = readCode('infra/traefik/ai-nutrition-coach-dynamic.yml');
  const script = readCode('bin/ai-nutrition-coach');

  it('publishes NO port and joins the external Traefik network', () => {
    expect(traefik).not.toContain('ports:');
    expect(traefik).not.toContain('network_mode');
    expect(traefik).toContain('external: true');
    expect(traefik).toContain('${AI_NUTRITION_COACH_TRAEFIK_NETWORK:-traefik}');
    for (const overlay of [certresolver, allowlist]) expect(overlay).not.toContain('ports:');
  });

  it('keeps the same container hardening as the base file', () => {
    expect(traefik).toContain('read_only: true');
    expect(traefik).toContain('cap_drop: [ALL]');
    expect(traefik).toContain('no-new-privileges:true');
    expect(traefik).toContain('/tmp:rw,noexec,nosuid');
    expect(traefik).toContain('${AI_NUTRITION_COACH_CONNECT_SRC_EXTRA:-}');
  });

  it('routes the domain over HTTPS to port 8080', () => {
    expect(traefik).toContain('traefik.enable: "true"');
    expect(traefik).toContain(
      'traefik.http.routers.ai-nutrition-coach.rule: Host(`${AI_NUTRITION_COACH_DOMAIN:?',
    );
    expect(traefik).toContain(
      'traefik.http.routers.ai-nutrition-coach.entrypoints: ${AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT:-websecure}',
    );
    expect(traefik).toContain('traefik.http.routers.ai-nutrition-coach.tls: "true"');
    expect(traefik).toContain(
      'traefik.http.services.ai-nutrition-coach.loadbalancer.server.port: "8080"',
    );
  });

  it('HSTS only: one year, no preload, nothing that would replace the CSP', () => {
    expect(traefik).toContain('headers.stsSeconds: "31536000"');
    expect(traefik).toContain('headers.stsPreload: "false"');
    expect(traefik).toContain(
      'stsIncludeSubdomains: ${AI_NUTRITION_COACH_TRAEFIK_HSTS_SUBDOMAINS:-false}',
    );
    for (const forbidden of [
      'customResponseHeaders',
      'contentSecurityPolicy',
      'customFrameOptions',
      'frameDeny',
      'contentTypeNosniff',
      'referrerPolicy',
      'permissionsPolicy',
      'basicauth',
    ]) {
      expect(traefik.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
  });

  it('the cert resolver is an overlay, so no empty label can exist', () => {
    expect(traefik).not.toContain('certresolver');
    expect(certresolver).toContain('traefik.http.routers.ai-nutrition-coach.tls.certresolver');
    expect(certresolver).toContain('${AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER:?');
  });

  it('the allow-list overlay is ipAllowList, not basic auth', () => {
    expect(allowlist).toContain('ipallowlist.sourcerange');
    expect(allowlist).not.toContain('basicauth');
    expect(allowlist).toContain(
      'traefik.http.routers.ai-nutrition-coach.middlewares: ai-nutrition-coach-hsts,ai-nutrition-coach-allow',
    );
  });

  it('the host-Traefik example targets loopback and keeps HSTS', () => {
    expect(dynamic).toContain('http://127.0.0.1:8080');
    expect(dynamic).toContain('stsSeconds: 31536000');
    expect(dynamic).toContain('stsPreload: false');
    expect(dynamic).toContain('ipAllowList');
    expect(dynamic).not.toContain('0.0.0.0');
  });

  it('bin/ai-nutrition-coach has --traefik with strict validation', () => {
    expect(script).toContain('--traefik)');
    expect(script).toContain('validate_traefik');
    expect(script).toContain('validate_domain');
    expect(script).toContain('docker network inspect');
    expect(script).toContain('docker-compose.traefik-certresolver.yml');
    expect(script).toContain('docker-compose.traefik-allowlist.yml');
  });

  // Runs the real script (POSIX sh); validation happens before Docker is needed.
  const up = (env, args = ['up', '--traefik']) =>
    spawnSync('sh', [join(root, 'bin/ai-nutrition-coach'), ...args], {
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env },
      encoding: 'utf8',
    });
  const D = { AI_NUTRITION_COACH_DOMAIN: 'ok.example.com' };

  it('refuses without a domain (exit 41)', () => {
    const r = up({});
    expect(r.status, r.stderr).toBe(41);
    expect(r.stderr).toContain('AI_NUTRITION_COACH_DOMAIN');
  });

  it.each([
    { AI_NUTRITION_COACH_DOMAIN: 'plate.example.com/x' },
    { AI_NUTRITION_COACH_DOMAIN: 'a b' },
    { AI_NUTRITION_COACH_DOMAIN: 'x`),Host(`evil.com' },
    { ...D, AI_NUTRITION_COACH_TRAEFIK_NETWORK: 'a b' },
    { ...D, AI_NUTRITION_COACH_TRAEFIK_NETWORK: '-lead' },
    { ...D, AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT: 'web;x' },
    { ...D, AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT: '$(id)' },
    { ...D, AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER: 'le,x' },
    { ...D, AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER: 'le\nx' },
    { ...D, AI_NUTRITION_COACH_TRAEFIK_HSTS_SUBDOMAINS: 'yes' },
    { ...D, AI_NUTRITION_COACH_TRAEFIK_ALLOWLIST: '1.2.3.4' },
    { ...D, AI_NUTRITION_COACH_TRAEFIK_ALLOWLIST: '10.0.0.0/8,evil' },
    { ...D, AI_NUTRITION_COACH_CONNECT_SRC_EXTRA: "https://a.example'; script-src *" },
  ])('refuses invalid settings (exit 42): %j', (env) => {
    const r = up(env);
    expect(r.status, r.stderr).toBe(42);
    expect(r.stderr.startsWith('ai-nutrition-coach:')).toBe(true);
  });

  it('valid settings pass validation (the next failure is Docker, not input)', () => {
    const r = up({
      ...D,
      AI_NUTRITION_COACH_DOMAIN: 'plate.example.com',
      AI_NUTRITION_COACH_TRAEFIK_NETWORK: 'proxy_net.1',
      AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT: 'websecure',
      AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER: 'letsencrypt',
      AI_NUTRITION_COACH_TRAEFIK_ALLOWLIST: '192.168.1.0/24,100.64.0.0/10,fd00::/8',
      AI_NUTRITION_COACH_TRAEFIK_HSTS_SUBDOMAINS: 'true',
      AI_NUTRITION_COACH_CONNECT_SRC_EXTRA: 'https://api.openai.com',
    });
    // 10 = no docker here; 43 = docker present but no such network. Never 41/42.
    expect([10, 43], r.stderr).toContain(r.status);
  });
});
