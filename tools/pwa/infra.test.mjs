// The self-host configuration, pinned (port of the Phase 4 / Phase 8 parts of
// the earlier client). The container itself is exercised by
// scripts/smoke_self_host.sh; these are the cheap static pins that run in `pnpm verify`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

  it('serves nothing but GET/HEAD (plus the AI proxy POST), no bodies, no proxying, no resolver', () => {
    // GET/HEAD everywhere; POST only to the one AI proxy path (a 404 unless the operator enabled it).
    expect(conf).toContain('if ($ai_nutrition_coach_method_ok = 0) { return 405; }');
    expect(conf).toMatch(/"~\^\(GET\|HEAD\) "\s+1;/);
    expect(conf).toMatch(/"POST \/ai\/v1\/chat\/completions"\s+1;/);
    expect(conf.match(/^\s*"(?!~)[A-Z]+ /gm)).toHaveLength(1);
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
  const auth = readCode('infra/docker-compose.traefik-auth.yml');
  const authentik = readCode('infra/docker-compose.traefik-authentik.yml');
  const serverEnv = readCode('infra/server.env.example');
  const dynamic = readCode('infra/traefik/ai-nutrition-coach-dynamic.yml');
  const script = readCode('bin/ai-nutrition-coach');

  it('publishes NO port and joins the external Traefik network', () => {
    expect(traefik).not.toContain('ports:');
    expect(traefik).not.toContain('network_mode');
    expect(traefik).toContain('external: true');
    expect(traefik).toContain('${AI_NUTRITION_COACH_TRAEFIK_NETWORK:-traefik}');
    for (const overlay of [certresolver, allowlist, auth, authentik]) {
      expect(overlay).not.toContain('ports:');
      expect(overlay).not.toContain('network_mode');
    }
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
    expect(traefik).toContain(
      'traefik.http.routers.ai-nutrition-coach.tls: ${AI_NUTRITION_COACH_TRAEFIK_TLS:-true}',
    );
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

  it('builds from this checkout with the same arguments as bin/ai-nutrition-coach', () => {
    expect(traefik).toContain('dockerfile: infra/Dockerfile');
    expect(traefik).toContain('AI_NUTRITION_COACH_PROJECT_URL: ${AI_NUTRITION_COACH_PROJECT_URL:-}');
    expect(traefik).toContain('AI_NUTRITION_COACH_RELEASE: ${AI_NUTRITION_COACH_RELEASE:-0}');
  });

  it('the sign-in overlay keeps HSTS and has NO default middleware (compose refuses to start)', () => {
    expect(auth).toContain(
      'traefik.http.routers.ai-nutrition-coach.middlewares: ai-nutrition-coach-hsts,${AI_NUTRITION_COACH_TRAEFIK_AUTH_MIDDLEWARE:?',
    );
    expect(auth).not.toContain('AI_NUTRITION_COACH_TRAEFIK_AUTH_MIDDLEWARE:-');
  });

  it("the Authentik overlay routes ONLY the outpost path of the app's host, without the middleware", () => {
    expect(authentik).toContain(
      'traefik.http.routers.ai-nutrition-coach-sso.rule: Host(`${AI_NUTRITION_COACH_DOMAIN:?',
    );
    expect(authentik).toContain('&& PathPrefix(`/outpost.goauthentik.io/`)');
    expect(authentik).toContain(
      'traefik.http.routers.ai-nutrition-coach-sso.service: ${AI_NUTRITION_COACH_AUTHENTIK_OUTPOST_SERVICE:?',
    );
    expect(authentik).toContain('ai-nutrition-coach-sso.tls: ${AI_NUTRITION_COACH_TRAEFIK_TLS:-true}');
    expect(authentik).not.toContain('middlewares');
    // It never touches the app's own router.
    expect(authentik).not.toContain('routers.ai-nutrition-coach.');
  });

  it('the server example wires all three files and the sign-in, with no secret', () => {
    expect(serverEnv).toContain(
      'COMPOSE_FILE=docker-compose.traefik.yml:docker-compose.traefik-auth.yml:docker-compose.traefik-authentik.yml',
    );
    expect(serverEnv).toMatch(/^AI_NUTRITION_COACH_TRAEFIK_AUTH_MIDDLEWARE=\S+/m);
    expect(serverEnv).toMatch(/^AI_NUTRITION_COACH_AUTHENTIK_OUTPOST_SERVICE=\S+/m);
    expect(serverEnv).not.toMatch(/KEY|TOKEN|SECRET|PASSWORD/i);
  });

  it('the manifest is fetched with credentials (installable behind a forward-auth sign-in)', () => {
    expect(read('apps/web/index.html')).toMatch(
      /<link rel="manifest" href="\/manifest\.webmanifest" crossorigin="use-credentials" \/>/,
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
    expect(script).toContain('docker-compose.traefik-auth.yml');
    expect(script).toContain('docker-compose.traefik-authentik.yml');
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
    { ...D, AI_NUTRITION_COACH_TRAEFIK_TLS: 'no' },
    { ...D, AI_NUTRITION_COACH_TRAEFIK_AUTH_MIDDLEWARE: 'authentik@file,evil' },
    { ...D, AI_NUTRITION_COACH_TRAEFIK_AUTH_MIDDLEWARE: 'a@b@c' },
    { ...D, AI_NUTRITION_COACH_TRAEFIK_AUTH_MIDDLEWARE: 'authentik@file\nx' },
    { ...D, AI_NUTRITION_COACH_AUTHENTIK_OUTPOST_SERVICE: 'sso@file' },
    {
      ...D,
      AI_NUTRITION_COACH_TRAEFIK_AUTH_MIDDLEWARE: 'authentik@file',
      AI_NUTRITION_COACH_AUTHENTIK_OUTPOST_SERVICE: 'sso@file`)',
    },
    {
      ...D,
      AI_NUTRITION_COACH_TRAEFIK_AUTH_MIDDLEWARE: 'authentik@file',
      AI_NUTRITION_COACH_TRAEFIK_ALLOWLIST: '10.0.0.0/8',
    },
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

  it('the Authentik-behind-a-tunnel settings pass validation', () => {
    const r = up({
      AI_NUTRITION_COACH_DOMAIN: 'ai-nutrition-coach.mornati.ovh',
      AI_NUTRITION_COACH_TRAEFIK_NETWORK: 'traefik-network',
      AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT: 'insecure',
      AI_NUTRITION_COACH_TRAEFIK_TLS: 'false',
      AI_NUTRITION_COACH_TRAEFIK_AUTH_MIDDLEWARE: 'authentik@file',
      AI_NUTRITION_COACH_AUTHENTIK_OUTPOST_SERVICE: 'sso@file',
    });
    expect([10, 43], r.stderr).toContain(r.status);
  });
});

describe('instance-wide AI proxy (docs/self-host.md "Offer AI to everyone on your instance")', () => {
  const script = join(root, 'infra/nginx/docker-entrypoint.d/40-render-ai-proxy.sh');
  const tplDir = join(root, 'infra/nginx/ai-proxy');
  const PATH = process.env.PATH ?? '/usr/bin:/bin';
  // A key-shaped fixture that is allow-listed exactly in .gitleaks.toml.
  const KEY = 'sk-test-abcdef123456';
  const ON = {
    AI_PROXY_ENABLED: '1',
    AI_PROXY_UPSTREAM: 'https://openrouter.ai/api/v1',
    AI_PROXY_KEY: KEY,
    AI_PROXY_MODEL: 'vendor/model-x',
  };

  // Runs the real POSIX-sh entrypoint script (no Docker needed) into a temp "/tmp".
  const render = (env, { pre = {} } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'anc_ai_'));
    try {
      const resolv = join(dir, 'resolv.conf');
      writeFileSync(resolv, 'search example.test\nnameserver 127.0.0.11\noptions ndots:0\n');
      for (const [name, text] of Object.entries(pre)) writeFileSync(join(dir, name), text);
      const r = spawnSync('sh', [script], {
        env: {
          PATH,
          AI_PROXY_OUT_DIR: dir,
          AI_PROXY_TEMPLATE_DIR: tplDir,
          AI_PROXY_RESOLV_CONF: resolv,
          ...env,
        },
        encoding: 'utf8',
      });
      const path = (name) => join(dir, `ai-nutrition-coach-ai-${name}.inc`);
      const file = (name) => (existsSync(path(name)) ? readFileSync(path(name), 'utf8') : '');
      const modes = Object.fromEntries(
        ['locations', 'http', 'main'].map((n) => [n, existsSync(path(n)) ? statSync(path(n)).mode & 0o777 : 0]),
      );
      return {
        code: r.status,
        out: `${r.stdout}${r.stderr}`,
        locations: file('locations'),
        http: file('http'),
        main: file('main'),
        modes,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const expectOff = (r) => {
    expect(r.code).toBe(0);
    expect(r.locations).toContain(`return 200 '{"enabled":false}';`);
    expect(r.locations).toContain('location ^~ /ai/ {');
    expect(r.locations).toContain('return 404;');
    expect(r.locations).not.toMatch(/^\s*(proxy_pass|resolver|proxy_set_header)\b/m);
    expect(r.locations).not.toContain(KEY);
    expect(r.main).not.toContain('load_module');
    expect(r.http).not.toContain('limit_req_zone');
  };

  it('is OFF by default: the image says so and the locations only answer disabled / 404', () => {
    expect(dockerfile).toContain('AI_PROXY_ENABLED="0"');
    expectOff(render({}));
    expectOff(render({ ...ON, AI_PROXY_ENABLED: '0' }));
    expectOff(render({ ...ON, AI_PROXY_ENABLED: 'true' }));
  });

  it('enabled but with an empty key stays off (and says so, without a value)', () => {
    const r = render({ ...ON, AI_PROXY_KEY: '' });
    expectOff(r);
    expect(r.out).toContain('AI_PROXY_KEY is empty');
  });

  it('on: the key is injected by nginx, the client is not trusted with any header', () => {
    const r = render(ON);
    expect(r.code, r.out).toBe(0);
    const loc = r.locations;
    expect(loc).toContain(`proxy_set_header Authorization "Bearer ${KEY}";`);
    // Whitelist, not blacklist: nothing the browser sent is forwarded (Authorization and Cookie
    // included), and no client header is read into the upstream request.
    expect(loc).toContain('proxy_pass_request_headers off;');
    expect(loc).not.toMatch(/\$http_(authorization|cookie|x_|origin|referer|user_agent)/i);
    expect(loc).not.toContain('$remote_addr');
    expect(loc).not.toMatch(/proxy_set_header (Cookie|X-Forwarded-For|X-Real-IP|Origin|Referer)\b/);
    // POST only; GET and anything else is a 405 inside the location (the server-level map lets only
    // GET/HEAD and this one POST through).
    expect(loc).toContain('if ($request_method != POST) { return 405; }');
    expect(loc).toContain('location = /ai/v1/chat/completions {');
    expect(loc).toContain('set $anc_ai_upstream "https://openrouter.ai/api/v1/chat/completions";');
    expect(loc).toContain('proxy_pass $anc_ai_upstream;');
    expect(loc).toContain('proxy_set_header Host "openrouter.ai";');
    // Sized for one downscaled photo; per-client rate and connection limits; calm 429s.
    expect(loc).toContain('client_max_body_size 2m;');
    expect(loc).toMatch(/limit_req zone=ai_nutrition_coach_ai burst=5 nodelay;/);
    expect(loc).toMatch(/limit_req_status 429;/);
    expect(loc).toMatch(/limit_conn ai_nutrition_coach_ai_ip \d+;/);
    expect(loc).toMatch(/limit_conn ai_nutrition_coach_ai_all \d+;/);
    expect(r.http).toMatch(
      /limit_req_zone \$binary_remote_addr zone=ai_nutrition_coach_ai:\d+m rate=10r\/m;/,
    );
    // Rejections are logged below the error_log level: no client address in the container log.
    expect(r.http).toContain('limit_req_log_level info;');
    expect(r.http).toContain('limit_conn_log_level info;');
    // TLS to the provider, verified against the system CA bundle; timeouts sit just above the app's 45 s.
    expect(loc).toContain('proxy_ssl_server_name on;');
    expect(loc).toContain('proxy_ssl_verify on;');
    expect(loc).toContain('proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;');
    expect(loc).toContain('proxy_read_timeout 50s;');
    expect(loc).toContain('resolver 127.0.0.11 valid=30s ipv6=off;');
    // The model is forced server-side by njs, which is loaded only now.
    expect(loc).toContain('set $anc_ai_model "vendor/model-x";');
    expect(loc).toContain('js_set $anc_ai_body anc_ai.body;');
    expect(loc).toContain('proxy_set_body $anc_ai_body;');
    expect(r.main).toContain('load_module /usr/lib/nginx/modules/ngx_http_js_module.so;');
    expect(r.http).toContain('js_import anc_ai from ai-proxy.js;');
    // An upstream 401/403 (a refused key) must not echo the provider's message to a visitor.
    expect(loc).toContain('error_page 401 403 = @ai_nutrition_coach_ai_refused;');
    expect(loc).toContain('proxy_hide_header Set-Cookie;');
    // No body, header or query ever reaches a log.
    expect(loc).not.toMatch(/\baccess_log\b|\$request_body|\$query_string|\$args/);
  });

  it('the config endpoint names the model and a label, never the key or the upstream', () => {
    const r = render({ ...ON, AI_PROXY_LABEL: 'OpenRouter (free)' });
    const json = /location = \/ai\/config\.json \{[^}]*return 200 '([^']*)';/.exec(r.locations)[1];
    expect(JSON.parse(json)).toEqual({
      enabled: true,
      model: 'vendor/model-x',
      label: 'OpenRouter (free)',
    });
    expect(json).not.toContain(KEY);
    expect(json).not.toContain('openrouter.ai/api');
    expect(r.locations).toMatch(
      /location = \/ai\/config\.json \{[^}]*add_header Cache-Control "no-store";/,
    );
    // The default label is the provider's host name.
    const d = render(ON);
    expect(/return 200 '([^']*)';/.exec(d.locations)[1]).toContain('"label":"openrouter.ai"');
  });

  it('the key reaches ONE file, mode 0600, and never a message of the script', () => {
    const r = render(ON);
    expect(r.locations).toContain(KEY);
    for (const other of [r.http, r.main]) expect(other).not.toContain(KEY);
    expect(r.out).not.toContain(KEY);
    expect(r.modes).toEqual({ locations: 0o600, http: 0o600, main: 0o600 });
    expect(r.locations).not.toContain('@@');
  });

  it('refuses to start if the key is found in any other rendered file (access log, headers, config)', () => {
    const r = render(ON, { pre: { 'ai-nutrition-coach-access-log.inc': `# leaked ${KEY}\n` } });
    expect(r.code).toBe(1);
    expect(r.out).toContain('leaked into');
    expect(r.out).toContain('ai-nutrition-coach-access-log.inc');
    expect(r.out).not.toContain(KEY);
  });

  it('every bad value refuses to start and is never printed', () => {
    const SECRETISH = 'ZZSECRETVALUEZZ';
    const bad = [
      { AI_PROXY_KEY: `${SECRETISH} with space` },
      { AI_PROXY_KEY: `${SECRETISH}"; add_header X-Evil 1; #` },
      { AI_PROXY_KEY: `${SECRETISH}$x` },
      { AI_PROXY_KEY: `${SECRETISH}\nsecond-line` },
      { AI_PROXY_KEY: 'short' },
      { AI_PROXY_UPSTREAM: `http://${SECRETISH}.test/v1` },
      { AI_PROXY_UPSTREAM: `https://${SECRETISH}.test/v1?key=1` },
      { AI_PROXY_UPSTREAM: `https://${SECRETISH}.test/v1;x` },
      { AI_PROXY_UPSTREAM: `https://user:${SECRETISH}@x.test/v1` },
      { AI_PROXY_UPSTREAM: `https://${SECRETISH}.test/../v1` },
      { AI_PROXY_UPSTREAM: '' },
      { AI_PROXY_MODEL: `${SECRETISH}'; return 200` },
      { AI_PROXY_MODEL: '' },
      { AI_PROXY_LABEL: `${SECRETISH}"}` },
      { AI_PROXY_RATE: `${SECRETISH}` },
      { AI_PROXY_RATE: '10r/h' },
      { AI_PROXY_BURST: `-${SECRETISH}` },
      { AI_PROXY_MAX_TOKENS: '0' },
      { AI_PROXY_RESOLVER: `${SECRETISH}` },
    ];
    for (const over of bad) {
      const r = render({ ...ON, ...over });
      expect(r.code, JSON.stringify(Object.keys(over))).toBe(1);
      expect(r.out).toContain('refusing to start');
      expect(r.out).not.toContain(SECRETISH);
      expect(r.out).not.toContain(KEY);
      expect(r.locations).toBe('');
    }
  });

  it('accepts a real-world setup: a port, a path, a label with spaces, tuned limits', () => {
    const r = render({
      ...ON,
      AI_PROXY_UPSTREAM: 'https://llm.internal.example.test:8443/openai/v1/',
      AI_PROXY_MODEL: 'google/gemini-2.0-flash-001',
      AI_PROXY_LABEL: 'Our LLM (EU)',
      AI_PROXY_RATE: '2r/s',
      AI_PROXY_BURST: '8',
      AI_PROXY_MAX_TOKENS: '1500',
      AI_PROXY_RESOLVER: '10.0.0.2',
    });
    expect(r.code, r.out).toBe(0);
    expect(r.locations).toContain(
      '"https://llm.internal.example.test:8443/openai/v1/chat/completions"',
    );
    expect(r.locations).toContain('proxy_set_header Host "llm.internal.example.test:8443";');
    expect(r.locations).toContain('proxy_ssl_name "llm.internal.example.test:8443";');
    expect(r.locations).toContain('resolver 10.0.0.2 valid=30s');
    expect(r.locations).toContain('burst=8 nodelay');
    expect(r.locations).toContain('set $anc_ai_max_tokens "1500";');
    expect(r.http).toContain('rate=2r/s');
  });

  it('the server-level config lets POST through to exactly one path and holds no proxy of its own', () => {
    expect(conf).toContain('include /tmp/ai-nutrition-coach-ai-locations.inc;');
    const nginxConf = readCode('infra/nginx/nginx.conf');
    expect(nginxConf).toContain('include /tmp/ai-nutrition-coach-ai-main.inc;');
    expect(nginxConf).toContain('include /tmp/ai-nutrition-coach-ai-http.inc;');
    // The static template itself never proxies, resolves or holds a key.
    expect(readCode('infra/nginx/templates/ai-nutrition-coach.conf.template')).not.toMatch(
      /^\s*(proxy_pass|resolver|proxy_set_header)\b/m,
    );
    // The rendered files live in /tmp (a tmpfs): the image holds no key and no rendered proxy.
    expect(dockerfile).toContain('COPY infra/nginx/ai-proxy/ /etc/ai-nutrition-coach/ai-proxy/');
    expect(dockerfile).toContain('40-render-ai-proxy.sh');
    expect(dockerfile).not.toMatch(/\b(ARG|ENV)\b[^\n]*AI_PROXY_(KEY|UPSTREAM|MODEL)/);
    // The stock envsubst step only touches AI_NUTRITION_COACH_* variables, so it never sees the key.
    expect(dockerfile).toContain('NGINX_ENVSUBST_FILTER=AI_NUTRITION_COACH_');
  });

  it('no config, template or script logs a header, a body or a query string', () => {
    for (const f of [
      'infra/nginx/ai-proxy/ai-proxy.locations.inc.template',
      'infra/nginx/ai-proxy/ai-proxy.http.inc.template',
      'infra/nginx/ai-proxy/ai-proxy.disabled.inc.template',
      'infra/nginx/docker-entrypoint.d/40-render-ai-proxy.sh',
    ]) {
      const text = readCode(f);
      expect(text, f).not.toMatch(/\baccess_log\b|\$http_|\$request_body|\$args\b|\$query_string/);
      expect(text, f).not.toMatch(/set -x|echo [^\n]*\$key|printf [^\n]*\$key[^\n]*>&2/);
    }
    // And the access-log formats never include a header (the key travels only in one).
    for (const mode of ['on', 'full']) {
      const dir = mkdtempSync(join(tmpdir(), 'anc_log_'));
      try {
        const out = join(dir, 'log.inc');
        spawnSync('sh', [join(root, 'infra/nginx/docker-entrypoint.d/10-render-access-log.sh')], {
          env: { PATH, AI_NUTRITION_COACH_ACCESS_LOG: mode, AI_NUTRITION_COACH_ACCESS_LOG_OUT: out },
        });
        const format = /^log_format .*$/m.exec(readFileSync(out, 'utf8'))[0];
        expect(format).not.toMatch(
          /\$http_|authorization|\$request_body|\$args|\$query_string|\$request /i,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('compose and the installer pass the settings through, off by default, and never print the key', () => {
    for (const file of ['infra/docker-compose.yml', 'infra/docker-compose.traefik.yml']) {
      const text = read(file);
      expect(text, file).toContain('AI_PROXY_ENABLED: ${AI_PROXY_ENABLED:-0}');
      for (const v of ['UPSTREAM', 'KEY', 'MODEL', 'LABEL']) {
        expect(text, file).toContain(`AI_PROXY_${v}: \${AI_PROXY_${v}:-}`);
      }
    }
    const example = read('infra/server.env.example');
    expect(example).toMatch(/^AI_PROXY_ENABLED=0$/m);
    // Every other AI_PROXY_ line is a comment (no key, ever, in the example).
    expect(example).not.toMatch(/^AI_PROXY_(?!ENABLED=0)/m);
    expect(example).toMatch(/^#AI_PROXY_UPSTREAM=https:\/\//m);
    expect(example).toMatch(/spend|abuse/i);
    const bin = read('bin/ai-nutrition-coach');
    // The key goes to `docker run` by NAME (inherited), never as a value in an argument.
    expect(bin).toContain('-e AI_PROXY_KEY');
    expect(bin).not.toMatch(/AI_PROXY_KEY=/);
    const run = (env) =>
      spawnSync('sh', [join(root, 'bin/ai-nutrition-coach'), 'up'], {
        env: { PATH, ...env },
        encoding: 'utf8',
      });
    const noKey = run({
      AI_PROXY_ENABLED: '1',
      AI_PROXY_UPSTREAM: 'https://x.test/v1',
      AI_PROXY_MODEL: 'm',
    });
    expect(noKey.status).toBe(42);
    expect(noKey.stderr).toContain('AI_PROXY_KEY');
    const plainHttp = run({ ...ON, AI_PROXY_UPSTREAM: 'http://x.test/v1' });
    expect(plainHttp.status).toBe(42);
    expect(`${plainHttp.stdout}${plainHttp.stderr}`).not.toContain(KEY);
    const noModel = run({ ...ON, AI_PROXY_MODEL: '' });
    expect(noModel.status).toBe(42);
  });

  it('/ai/config.json is never precached: nothing under public/ai, and the generator names no /ai/ file', () => {
    expect(existsSync(join(root, 'apps/web/public/ai'))).toBe(false);
    expect(readCode('tools/generate_precache_manifest.mjs')).not.toMatch(/['"`/]ai\/config/);
  });
});

describe('njs body rewrite (infra/nginx/ai-proxy/ai-proxy.js)', () => {
  const run = async (body, vars = { anc_ai_model: 'vendor/model-x', anc_ai_max_tokens: '2000' }) => {
    const { default: mod } = await import('../../infra/nginx/ai-proxy/ai-proxy.js');
    return mod.body({ variables: vars, requestText: body });
  };

  it('forces the model, caps max_tokens and keeps only the safe fields', async () => {
    const out = JSON.parse(
      await run(
        JSON.stringify({
          model: 'vendor/expensive-model',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 99999,
          temperature: 0.2,
          top_p: 0.9,
          stream: true,
          n: 8,
          tools: [{}],
          logprobs: true,
          response_format: { type: 'json_object' },
        }),
      ),
    );
    expect(out).toEqual({
      model: 'vendor/model-x',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 2000,
      temperature: 0.2,
      top_p: 0.9,
      response_format: { type: 'json_object' },
    });
  });

  it('sets max_tokens when the client sent none and keeps a smaller one', async () => {
    const m = [{ role: 'user', content: 'x' }];
    expect(JSON.parse(await run(JSON.stringify({ messages: m }))).max_tokens).toBe(2000);
    expect(JSON.parse(await run(JSON.stringify({ messages: m, max_tokens: 50 }))).max_tokens).toBe(
      50,
    );
    expect(JSON.parse(await run(JSON.stringify({ messages: m, max_tokens: -5 }))).max_tokens).toBe(
      2000,
    );
    const small = { anc_ai_model: 'm', anc_ai_max_tokens: '300' };
    expect(
      JSON.parse(await run(JSON.stringify({ messages: m, max_tokens: 9999 }), small)).max_tokens,
    ).toBe(300);
  });

  it('turns anything that is not a chat request into an empty object the provider refuses', async () => {
    for (const body of ['not json', '[]', 'null', '"x"', '{}', '{"messages":"x"}', undefined]) {
      expect(await run(body)).toBe('{}');
    }
  });
});
