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

  it('fetches the three pinned assets (engine, decoder, Argon2id) BEFORE the sources are copied', () => {
    const fetchAt = dockerfile.indexOf('bash scripts/fetch_web_sqlite3mc.sh');
    expect(fetchAt).toBeGreaterThan(0);
    expect(dockerfile.indexOf('bash scripts/fetch_web_zxing_pwa.sh')).toBeGreaterThan(0);
    expect(dockerfile.indexOf('bash scripts/fetch_web_argon2.sh')).toBeGreaterThan(0);
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
      'Permissions-Policy "camera=(self), microphone=(self), geolocation=()"',
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
    expect(conf).toMatch(/"POST \/ai\/v1\/audio\/transcriptions"\s+1;/);
    expect(conf.match(/^\s*"(?!~)[A-Z]+ /gm)).toHaveLength(2);
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
    for (const hashed of ['^~ /assets/', '/sqlite3mc/', '/zxing/', '/argon2/']) {
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
    expect(loc).toContain(`if ($request_method != POST) { return 405 '{"error":"method_not_allowed"}'; }`);
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
    expect(loc).toMatch(/error_page 401 402 403 404 [0-9 ]+ = @ai_nutrition_coach_ai_refused;/);
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
      transcription: false,
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
      expect(text, f).not.toMatch(/\baccess_log\b|\$request_body|\$args\b|\$query_string/);
      // Only the three request headers the same-origin check needs; never a credential or an identifier.
      expect(text, f).not.toMatch(/\$http_(?!sec_fetch_site|origin|host)/);
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

describe('instance AI proxy: same origin, input budget, quiet upstream', () => {
  const script = join(root, 'infra/nginx/docker-entrypoint.d/40-render-ai-proxy.sh');
  const tplDir = join(root, 'infra/nginx/ai-proxy');
  const PATH = process.env.PATH ?? '/usr/bin:/bin';
  const KEY = 'sk-test-abcdef123456';
  const ON = {
    AI_PROXY_ENABLED: '1',
    AI_PROXY_UPSTREAM: 'https://openrouter.ai/api/v1',
    AI_PROXY_KEY: KEY,
    AI_PROXY_MODEL: 'vendor/model-x',
  };
  const render = (env, resolvText = 'nameserver 127.0.0.11\n') => {
    const dir = mkdtempSync(join(tmpdir(), 'anc_ai2_'));
    try {
      const resolv = join(dir, 'resolv.conf');
      writeFileSync(resolv, resolvText);
      const r = spawnSync('sh', [script], {
        env: { PATH, AI_PROXY_OUT_DIR: dir, AI_PROXY_TEMPLATE_DIR: tplDir, AI_PROXY_RESOLV_CONF: resolv, ...env },
        encoding: 'utf8',
      });
      const f = (n) => {
        const q = join(dir, `ai-nutrition-coach-ai-${n}.inc`);
        return existsSync(q) ? readFileSync(q, 'utf8') : '';
      };
      return { code: r.status, out: `${r.stdout}${r.stderr}`, loc: f('locations'), http: f('http') };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('refuses cross-site use: JSON only, Sec-Fetch-Site and Origin checked before anything is spent', () => {
    const { loc, http } = render(ON);
    expect(loc).toContain(`if ($content_type !~* "^application/json(;|$)") { return 415 '{"error":"json_only"}'; }`);
    expect(loc).toContain(`if ($anc_ai_sfs_bad) { return 403 '{"error":"same_origin_only"}'; }`);
    expect(loc).toContain(`if ($anc_ai_origin_bad) { return 403 '{"error":"same_origin_only"}'; }`);
    // The checks come before the rate limit (a refused request costs nothing) and before the proxy.
    for (const check of ['json_only', 'same_origin_only']) {
      expect(loc.indexOf(check)).toBeLessThan(loc.indexOf('limit_req zone='));
    }
    expect(http).toMatch(/map \$http_sec_fetch_site \$anc_ai_sfs_bad \{\s+default\s+1;\s+""\s+0;\s+"same-origin"\s+0;/);
    expect(http).toContain('map $http_origin $anc_ai_origin_host');
    expect(http).toContain('map "$anc_ai_origin_host|$http_host" $anc_ai_origin_bad');
    // Host is kept by the repo's Traefik and Caddy setups, so X-Forwarded-Host is not consulted.
    expect(http + loc).not.toContain('x_forwarded_host');
  });

  it('the Origin map accepts the same host[:port] and nothing else (the regexes, as PCRE)', () => {
    const { http } = render(ON);
    const hostRe = /"~\*\^https\?:\/\/\(\?<ah>\[\^\/\]\+\)\$"/;
    expect(http).toMatch(hostRe);
    const originHost = (origin) => {
      if (origin === '') return '';
      const m = /^https?:\/\/(?<ah>[^/]+)$/i.exec(origin);
      return m ? m.groups.ah : 'bad';
    };
    const bad = (origin, host) => {
      const key = `${originHost(origin)}|${host}`;
      if (/^\|/.test(key)) return 0;
      if (/^([^|]+)\|\1$/i.test(key)) return 0;
      return 1;
    };
    expect(bad('', 'plate.example.test')).toBe(0);
    expect(bad('https://plate.example.test', 'plate.example.test')).toBe(0);
    expect(bad('https://Plate.Example.Test', 'plate.example.test')).toBe(0);
    expect(bad('http://127.0.0.1:8080', '127.0.0.1:8080')).toBe(0);
    expect(bad('https://evil.test', 'plate.example.test')).toBe(1);
    expect(bad('https://plate.example.test.evil.test', 'plate.example.test')).toBe(1);
    expect(bad('http://127.0.0.1:9999', '127.0.0.1:8080')).toBe(1);
    expect(bad('null', 'plate.example.test')).toBe(1);
    expect(bad('https://plate.example.test/x', 'plate.example.test')).toBe(1);
  });

  it('never lets a provider header through, and turns provider error text into generic JSON', () => {
    const { loc } = render(ON);
    for (const h of [
      'Access-Control-Allow-Origin', 'Access-Control-Allow-Credentials', 'Access-Control-Allow-Headers',
      'Access-Control-Allow-Methods', 'Access-Control-Expose-Headers', 'OpenAI-Organization', 'OpenAI-Project',
      'OpenAI-Processing-Ms', 'X-Request-Id', 'X-RateLimit-Limit-Requests', 'X-RateLimit-Remaining-Tokens',
      'X-RateLimit-Reset', 'Location', 'Set-Cookie', 'Server',
    ]) {
      expect(loc, h).toContain(`proxy_hide_header ${h};`);
    }
    expect(loc).toContain('error_page 400 = @ai_nutrition_coach_ai_badrequest;');
    expect(loc).toContain('error_page 429 = @ai_nutrition_coach_ai_busy;');
    const refused = /error_page ([0-9 ]+) = @ai_nutrition_coach_ai_refused;/.exec(loc)[1].split(' ');
    for (const code of ['401', '402', '403', '404', '500', '503']) expect(refused).toContain(code);
    // 400 and 429 have their own handlers; 413 is nginx's own answer to an oversized body.
    for (const code of ['400', '429', '413']) expect(refused).not.toContain(code);
    expect(loc).toContain(`return 502 '{"error":"ai_provider_error"}';`);
    expect(loc).toContain(`return 400 '{"error":"ai_bad_request"}';`);
    expect(loc).toMatch(/add_header Retry-After \$upstream_http_retry_after always;/);
    // Upstream failures are logged at crit only, so no client address reaches the container log.
    expect(loc).toContain('error_log /dev/stderr crit;');
  });

  it('applies a per-address AND an instance-wide rate limit, both configurable', () => {
    const d = render(ON);
    expect(d.http).toMatch(/limit_req_zone \$binary_remote_addr zone=ai_nutrition_coach_ai:1m rate=10r\/m;/);
    expect(d.http).toMatch(/limit_req_zone \$server_name zone=ai_nutrition_coach_ai_rall:64k rate=30r\/m;/);
    expect(d.loc).toContain('limit_req zone=ai_nutrition_coach_ai burst=5 nodelay;');
    expect(d.loc).toContain('limit_req zone=ai_nutrition_coach_ai_rall burst=5 nodelay;');
    expect(d.loc).toContain('limit_conn ai_nutrition_coach_ai_ip 2;');
    const t = render({ ...ON, AI_PROXY_RATE: '3r/m', AI_PROXY_RATE_ALL: '9r/m', AI_PROXY_CONN: '4' });
    expect(t.http).toContain('rate=3r/m');
    expect(t.http).toContain('zone=ai_nutrition_coach_ai_rall:64k rate=9r/m');
    expect(t.loc).toContain('limit_conn ai_nutrition_coach_ai_ip 4;');
    for (const over of [{ AI_PROXY_RATE_ALL: 'lots' }, { AI_PROXY_RATE_ALL: '0r/m' }, { AI_PROXY_CONN: '0' }, { AI_PROXY_CONN: '1000' }]) {
      expect(render({ ...ON, ...over }).code, JSON.stringify(over)).toBe(1);
    }
  });

  it('AI_PROXY_TOKEN_PARAM is validated and reaches njs', () => {
    expect(render(ON).loc).toContain('set $anc_ai_token_param "max_tokens";');
    expect(render({ ...ON, AI_PROXY_TOKEN_PARAM: 'max_completion_tokens' }).loc).toContain(
      'set $anc_ai_token_param "max_completion_tokens";',
    );
    expect(render({ ...ON, AI_PROXY_TOKEN_PARAM: 'max_tokens; x' }).code).toBe(1);
    expect(render({ ...ON, AI_PROXY_TOKEN_PARAM: 'tokens' }).code).toBe(1);
  });

  it('rejects a placeholder inside a value, truncates a long default label and skips a scoped nameserver', () => {
    const r = render({ ...ON, AI_PROXY_MODEL: 'a@@ANC_AI_KEY@@b' });
    expect(r.code).toBe(1);
    expect(r.out).not.toContain(KEY);
    expect(r.loc).toBe('');
    const longHost = `${'a'.repeat(50)}.${'b'.repeat(50)}.example.test`;
    const l = render({ ...ON, AI_PROXY_UPSTREAM: `https://${longHost}/v1` });
    expect(l.code, l.out).toBe(0);
    const label = JSON.parse(/return 200 '([^']*)';/.exec(l.loc)[1]).label;
    expect(label).toBe(longHost.slice(0, 60));
    const s = render(ON, 'nameserver fe80::1%eth0\nnameserver 10.1.2.3\n');
    expect(s.code, s.out).toBe(0);
    expect(s.loc).toContain('resolver 10.1.2.3 valid=30s');
    expect(render(ON, 'nameserver fe80::1%eth0\n').code).toBe(1);
  });

  it('the docs say what is bounded and where the limits are shared', () => {
    const self = read('docs/self-host.md');
    expect(self).toMatch(/per-address\s+limit[^.]*instance-wide/i);
    expect(self).toContain('max_completion_tokens');
    expect(self).toContain('/etc/hosts');
    expect(self).toContain('Sec-Fetch-Site');
    const sec = read('SECURITY.md');
    expect(sec).toMatch(/input is bounded/i);
    expect(sec).not.toMatch(/caps the reply size, but cannot/);
    expect(read('docs/telemetry-posture.md')).toContain('error_log');
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

  it('clamps max_tokens to at least 1, and honours max_completion_tokens for reasoning models', async () => {
    const m = [{ role: 'user', content: 'x' }];
    expect(JSON.parse(await run(JSON.stringify({ messages: m, max_tokens: 0.5 }))).max_tokens).toBe(1);
    const reasoning = { anc_ai_model: 'm', anc_ai_max_tokens: '800', anc_ai_token_param: 'max_completion_tokens' };
    const out = JSON.parse(await run(JSON.stringify({ messages: m, max_tokens: 5000 }), reasoning));
    expect(out).toEqual({ model: 'm', messages: m, max_completion_tokens: 800 });
    expect(out).not.toHaveProperty('max_tokens');
    expect(
      JSON.parse(await run(JSON.stringify({ messages: m, max_completion_tokens: 7 }), reasoning)).max_completion_tokens,
    ).toBe(7);
  });

  const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
  const photo = (url = IMG) => ({
    role: 'user',
    content: [
      { type: 'text', text: 'What is on the plate?' },
      { type: 'image_url', image_url: { url, detail: 'high', extra: 1 } },
    ],
  });
  const send = async (messages) => run(JSON.stringify({ messages }));

  it('accepts exactly the shapes the app sends and strips unknown keys', async () => {
    const out = JSON.parse(await send([{ role: 'system', content: 'Be kind.', name: 'x' }, photo(), { role: 'assistant', content: 'ok' }]));
    expect(out.messages).toEqual([
      { role: 'system', content: 'Be kind.' },
      { role: 'user', content: [{ type: 'text', text: 'What is on the plate?' }, { type: 'image_url', image_url: { url: IMG } }] },
      { role: 'assistant', content: 'ok' },
    ]);
    for (const type of ['png', 'webp']) {
      expect(JSON.parse(await send([photo(`data:image/${type};base64,AAAA`)])).messages).toHaveLength(1);
    }
  });

  it('bounds the input: 8 messages, known roles, 24 KB of text, one data: image and no remote URL', async () => {
    const user = (content) => ({ role: 'user', content });
    const refused = async (messages) => expect(await send(messages)).toBe('{}');
    await refused([]);
    await refused(Array.from({ length: 9 }, () => user('x')));
    expect(JSON.parse(await send(Array.from({ length: 8 }, () => user('x')))).messages).toHaveLength(8);
    await refused([{ role: 'tool', content: 'x' }]);
    await refused([{ role: 'constructor', content: 'x' }]);
    await refused([{ role: 'user' }]);
    await refused([user(7)]);
    await refused([user([{ type: 'input_audio', input_audio: {} }])]);
    await refused([user([{ type: 'text', text: 7 }])]);
    await refused([user([])]);
    // Text budget: 24 KB across messages and parts, counted in UTF-8 bytes.
    expect(JSON.parse(await send([user('a'.repeat(24 * 1024))])).messages).toHaveLength(1);
    await refused([user('a'.repeat(24 * 1024 + 1))]);
    await refused([user('a'.repeat(12 * 1024)), user('b'.repeat(12 * 1024 + 1))]);
    await refused([user('é'.repeat(12 * 1024 + 1))]);
    // Images: one only, and only an inline jpeg/png/webp.
    await refused([photo('https://evil.test/x.png')]);
    await refused([photo('http://127.0.0.1/x.png')]);
    await refused([photo('data:image/gif;base64,AAAA')]);
    await refused([photo('data:text/html;base64,AAAA')]);
    await refused([photo('data:image/jpeg;base64,AA AA')]);
    await refused([photo('data:image/jpeg,AAAA')]);
    await refused([photo(), photo()]);
    await refused([user([{ type: 'image_url', image_url: { url: IMG } }, { type: 'image_url', image_url: { url: IMG } }])]);
    await refused([user([{ type: 'image_url', image_url: 'x' }])]);
  });

  it('turns anything that is not a chat request into an empty object the provider refuses', async () => {
    for (const body of ['not json', '[]', 'null', '"x"', '{}', '{"messages":"x"}', undefined]) {
      expect(await run(body)).toBe('{}');
    }
  });
});

describe('instance AI proxy: voice transcription (POST /ai/v1/audio/transcriptions)', () => {
  const script = join(root, 'infra/nginx/docker-entrypoint.d/40-render-ai-proxy.sh');
  const tplDir = join(root, 'infra/nginx/ai-proxy');
  const PATH = process.env.PATH ?? '/usr/bin:/bin';
  const KEY = 'sk-test-abcdef123456';
  const ON = {
    AI_PROXY_ENABLED: '1',
    AI_PROXY_UPSTREAM: 'https://openrouter.ai/api/v1',
    AI_PROXY_KEY: KEY,
    AI_PROXY_MODEL: 'vendor/model-x',
  };
  const TX = { ...ON, AI_PROXY_TRANSCRIPTION: '1' };
  const render = (env) => {
    const dir = mkdtempSync(join(tmpdir(), 'anc_tx_'));
    try {
      const resolv = join(dir, 'resolv.conf');
      writeFileSync(resolv, 'nameserver 127.0.0.11\n');
      const r = spawnSync('sh', [script], {
        env: { PATH, AI_PROXY_OUT_DIR: dir, AI_PROXY_TEMPLATE_DIR: tplDir, AI_PROXY_RESOLV_CONF: resolv, ...env },
        encoding: 'utf8',
      });
      const path = (n) => join(dir, `ai-nutrition-coach-ai-${n}.inc`);
      const f = (n) => (existsSync(path(n)) ? readFileSync(path(n), 'utf8') : '');
      const leftovers = spawnSync('ls', [dir], { encoding: 'utf8' }).stdout.split('\n');
      return {
        code: r.status,
        out: `${r.stdout}${r.stderr}`,
        loc: f('locations'),
        http: f('http'),
        mode: existsSync(path('locations')) ? statSync(path('locations')).mode & 0o777 : 0,
        files: leftovers.filter((n) => n.startsWith('ai-nutrition-coach')),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  // Rendered config without its comment lines (a comment can never satisfy or break an assertion).
  const code = (text) =>
    text
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .join('\n');
  const configOf = (loc) => JSON.parse(/location = \/ai\/config\.json \{[^}]*return 200 '([^']*)';/.exec(loc)[1]);

  it('is OFF by default: no route is rendered, the path is a 404, the offer says transcription:false', () => {
    const r = render(ON);
    expect(r.code, r.out).toBe(0);
    expect(code(r.loc)).not.toContain('audio/transcriptions');
    expect(code(r.loc)).not.toContain('js_content');
    expect(configOf(r.loc)).toEqual({
      enabled: true,
      model: 'vendor/model-x',
      label: 'openrouter.ai',
      transcription: false,
    });
    // The catch-all answers 404 for the path (the server-level method map lets the POST through).
    expect(r.loc).toContain('location ^~ /ai/ {');
    expect(conf).toMatch(/"POST \/ai\/v1\/audio\/transcriptions"\s+1;/);
    for (const v of ['0', 'true', 'yes', '']) {
      const x = render({ ...ON, AI_PROXY_TRANSCRIPTION: v });
      expect(code(x.loc), v).not.toContain('audio/transcriptions');
    }
    // The proxy itself off means nothing at all, whatever AI_PROXY_TRANSCRIPTION says.
    const off = render({ ...TX, AI_PROXY_ENABLED: '0' });
    expect(code(off.loc)).not.toContain('audio/transcriptions');
    expect(off.loc).toContain(`return 200 '{"enabled":false}';`);
  });

  it('on: its own route with the same-origin checks first, multipart only, 1 MiB, njs validation then the proxy', () => {
    const r = render(TX);
    expect(r.code, r.out).toBe(0);
    const loc = r.loc;
    const route = /location = \/ai\/v1\/audio\/transcriptions \{[\s\S]*?\n\}\n/.exec(loc)[0];
    expect(route).toContain(`if ($request_method != POST) { return 405 '{"error":"method_not_allowed"}'; }`);
    expect(route).toContain(`if ($content_type !~* "^multipart/form-data;") { return 415 '{"error":"multipart_only"}'; }`);
    expect(route).toContain(`if ($anc_ai_sfs_bad) { return 403 '{"error":"same_origin_only"}'; }`);
    expect(route).toContain(`if ($anc_ai_origin_bad) { return 403 '{"error":"same_origin_only"}'; }`);
    // A refused request costs nothing: the checks come before the limits and before njs.
    for (const check of ['multipart_only', 'same_origin_only']) {
      expect(route.indexOf(check)).toBeLessThan(route.indexOf('limit_req zone='));
    }
    expect(route.indexOf('limit_req zone=')).toBeLessThan(route.indexOf('js_content'));
    expect(route).toContain('client_max_body_size 1m;');
    expect(route).toContain('client_body_buffer_size 1m;');
    expect(route).toContain('set $anc_ai_tx_model "whisper-1";');
    expect(route).toContain('js_content anc_ai.txGate;');
    expect(route).toContain('error_log /dev/stderr crit;');
    expect(route).toContain('add_header Cache-Control "no-store" always;');
    // The proxy half: an internal named location only (no request can address it).
    const proxy = /location @ai_nutrition_coach_tx_proxy \{[\s\S]*?\n\}\n/.exec(loc)[0];
    expect(proxy).toContain('set $anc_ai_upstream "https://openrouter.ai/api/v1/audio/transcriptions";');
    expect(proxy).toContain('proxy_pass $anc_ai_upstream;');
    expect(proxy).toContain('proxy_pass_request_headers off;');
    expect(proxy).toContain(`proxy_set_header Authorization "Bearer ${KEY}";`);
    expect(proxy).toContain('proxy_set_header Host "openrouter.ai";');
    // Header allow-list: only the multipart type (its boundary) comes from the browser.
    expect([...proxy.matchAll(/proxy_set_header (\S+) /g)].map((m) => m[1]).sort()).toEqual(
      ['Accept', 'Authorization', 'Connection', 'Content-Type', 'Host', 'User-Agent'],
    );
    expect(proxy).toContain('proxy_set_header Content-Type $content_type;');
    expect(proxy).not.toMatch(/\$http_|\$remote_addr|\$args|\$request_body/);
    // TLS verified, provider headers hidden, provider errors become generic JSON, no log of a body.
    expect(proxy).toContain('proxy_ssl_verify on;');
    for (const h of ['Set-Cookie', 'Access-Control-Allow-Origin', 'OpenAI-Organization', 'X-Request-Id', 'X-RateLimit-Remaining-Requests', 'Server']) {
      expect(proxy).toContain(`proxy_hide_header ${h};`);
    }
    expect(proxy).toContain('proxy_intercept_errors on;');
    expect(proxy).toMatch(/error_page 401 402 403 404 [0-9 ]+ = @ai_nutrition_coach_ai_refused;/);
    expect(proxy).toContain('error_page 429 = @ai_nutrition_coach_ai_busy;');
    expect(proxy).toContain('error_log /dev/stderr crit;');
    expect(loc).not.toMatch(/\baccess_log\b/);
    // The offer: transcription on, with the model the client must use. Never the key or upstream.
    expect(configOf(loc)).toEqual({
      enabled: true,
      model: 'vendor/model-x',
      label: 'openrouter.ai',
      transcription: true,
      transcriptionModel: 'whisper-1',
    });
    expect(JSON.stringify(configOf(loc))).not.toContain(KEY);
  });

  it('has its own, tighter limits (6r/m per address, 20r/m instance-wide, burst 2), configurable and validated', () => {
    const d = render(TX);
    expect(d.http).toContain('zone=ai_nutrition_coach_tx:1m rate=6r/m;');
    expect(d.http).toContain('zone=ai_nutrition_coach_tx_rall:64k rate=20r/m;');
    expect(d.loc).toContain('limit_req zone=ai_nutrition_coach_tx burst=2 nodelay;');
    expect(d.loc).toContain('limit_req zone=ai_nutrition_coach_tx_rall burst=2 nodelay;');
    expect(d.loc).toContain('limit_req_status 429;');
    expect(d.loc).toMatch(/limit_conn ai_nutrition_coach_ai_ip \d+;/);
    // The chat limits are untouched by it.
    expect(d.http).toContain('zone=ai_nutrition_coach_ai:1m rate=10r/m;');
    const t = render({
      ...TX,
      AI_PROXY_TRANSCRIPTION_RATE: '2r/m',
      AI_PROXY_TRANSCRIPTION_RATE_ALL: '5r/m',
      AI_PROXY_TRANSCRIPTION_BURST: '1',
      AI_PROXY_TRANSCRIPTION_MODEL: 'whisper-large-v3',
    });
    expect(t.code, t.out).toBe(0);
    expect(t.http).toContain('zone=ai_nutrition_coach_tx:1m rate=2r/m;');
    expect(t.http).toContain('zone=ai_nutrition_coach_tx_rall:64k rate=5r/m;');
    expect(t.loc).toContain('limit_req zone=ai_nutrition_coach_tx burst=1 nodelay;');
    expect(t.loc).toContain('set $anc_ai_tx_model "whisper-large-v3";');
    expect(configOf(t.loc).transcriptionModel).toBe('whisper-large-v3');
    for (const bad of [
      { AI_PROXY_TRANSCRIPTION_RATE: 'fast' },
      { AI_PROXY_TRANSCRIPTION_RATE: '0r/m' },
      { AI_PROXY_TRANSCRIPTION_RATE_ALL: '5' },
      { AI_PROXY_TRANSCRIPTION_BURST: '-1' },
      { AI_PROXY_TRANSCRIPTION_BURST: '1000' },
      { AI_PROXY_TRANSCRIPTION_MODEL: 'whisper 1' },
      { AI_PROXY_TRANSCRIPTION_MODEL: 'w"x' },
      { AI_PROXY_TRANSCRIPTION_MODEL: 'w;x' },
      { AI_PROXY_TRANSCRIPTION_MODEL: 'a@@ANC_AI_KEY@@b' },
    ]) {
      const x = render({ ...TX, ...bad });
      expect(x.code, JSON.stringify(bad)).toBe(1);
      expect(x.out).not.toContain(KEY);
      expect(x.loc).toBe('');
    }
  });

  it('voice settings are validated only when the voice route is on: a bad one never stops the chat proxy', () => {
    for (const bad of [
      { AI_PROXY_TRANSCRIPTION_RATE: 'fast' },
      { AI_PROXY_TRANSCRIPTION_MODEL: 'w;x' },
      { AI_PROXY_TRANSCRIPTION_BURST: 'x' },
    ]) {
      const r = render({ ...ON, ...bad });
      expect(r.code, JSON.stringify(bad)).toBe(0);
      expect(r.http).toContain('rate=6r/m;');
      expect(r.http).not.toContain('fast');
    }
  });

  it('a provider 413 on the voice route is the generic 502, and the local 413 stays a 413', () => {
    const loc = render(TX).loc;
    const proxy = /location @ai_nutrition_coach_tx_proxy \{[\s\S]*?\n\}\n/.exec(loc)[0];
    expect(proxy).toMatch(/error_page [0-9 ]*\b413\b[0-9 ]* = @ai_nutrition_coach_ai_refused;/);
    const route = /location = \/ai\/v1\/audio\/transcriptions \{[\s\S]*?\n\}\n/.exec(loc)[0];
    expect(route).not.toContain('error_page');
    expect(read('SECURITY.md')).toMatch(/preflight/);
  });

  it('the key still reaches ONE private file, with or without the voice route, and no leftover file holds it', () => {
    for (const env of [ON, TX]) {
      const r = render(env);
      expect(r.mode).toBe(0o600);
      expect(r.files.sort()).toEqual([
        'ai-nutrition-coach-ai-http.inc',
        'ai-nutrition-coach-ai-locations.inc',
        'ai-nutrition-coach-ai-main.inc',
      ]);
      expect(r.http).not.toContain(KEY);
      expect(r.out).not.toContain(KEY);
      expect(r.loc.split(KEY).length - 1).toBe(env === TX ? 2 : 1);
    }
  });

  it('no template, script or compose file logs a body, a header or the query, and the voice template reads only the allowed variables', () => {
    const text = readCode('infra/nginx/ai-proxy/ai-proxy.transcription.inc.template');
    expect(text).not.toMatch(/\baccess_log\b|\$request_body|\$args\b|\$query_string/);
    expect(text).not.toMatch(/\$http_/);
    expect(text).not.toMatch(/set -x/);
    expect(dockerfile).toContain('COPY infra/nginx/ai-proxy/ /etc/ai-nutrition-coach/ai-proxy/');
  });

  it('compose, the installer and the example pass the settings through, off by default', () => {
    for (const file of ['infra/docker-compose.yml', 'infra/docker-compose.traefik.yml']) {
      const t = read(file);
      expect(t, file).toContain('AI_PROXY_TRANSCRIPTION: ${AI_PROXY_TRANSCRIPTION:-0}');
      expect(t, file).toContain('AI_PROXY_TRANSCRIPTION_MODEL: ${AI_PROXY_TRANSCRIPTION_MODEL:-whisper-1}');
      expect(t, file).toContain('AI_PROXY_TRANSCRIPTION_RATE: ${AI_PROXY_TRANSCRIPTION_RATE:-6r/m}');
      expect(t, file).toContain('AI_PROXY_TRANSCRIPTION_RATE_ALL: ${AI_PROXY_TRANSCRIPTION_RATE_ALL:-20r/m}');
      expect(t, file).toContain('AI_PROXY_TRANSCRIPTION_BURST: ${AI_PROXY_TRANSCRIPTION_BURST:-2}');
    }
    const example = read('infra/server.env.example');
    // Commented out, like every other AI_PROXY_ setting except the master switch.
    expect(example).toMatch(/^#AI_PROXY_TRANSCRIPTION=0$/m);
    expect(example).not.toMatch(/^AI_PROXY_(?!ENABLED=0)/m);
    expect(example).toMatch(/1 MiB/);
    const bin = read('bin/ai-nutrition-coach');
    for (const v of ['TRANSCRIPTION', 'TRANSCRIPTION_MODEL', 'TRANSCRIPTION_RATE', 'TRANSCRIPTION_RATE_ALL', 'TRANSCRIPTION_BURST']) {
      expect(bin).toContain(`-e AI_PROXY_${v}`);
    }
    // Values travel by name (`-e NAME`), never as `-e NAME=value`.
    expect(bin).not.toMatch(/-e AI_PROXY_\w+=/);
  });

  it('the Permissions-Policy lets the app (and only the app) use the microphone, the CSP needs no change', () => {
    expect(headers).toContain('Permissions-Policy "camera=(self), microphone=(self), geolocation=()"');
    const csp = cspOf(headers);
    expect(csp).toContain("media-src 'self' blob:");
    expect(directive(csp, 'connect-src')).toMatch(/^connect-src 'self' /);
  });

  it('the docs name the new route, its limits, the 1 MiB body and the audio the provider receives', () => {
    const self = read('docs/self-host.md');
    expect(self).toContain('AI_PROXY_TRANSCRIPTION');
    expect(self).toContain('/ai/v1/audio/transcriptions');
    expect(self).toMatch(/6r\/m/);
    expect(self).toMatch(/1 MiB/);
    expect(read('SECURITY.md')).toMatch(/voice|audio/i);
    expect(read('docs/ai-tiers.md')).toMatch(/Describe a meal/);
    expect(read('docs/telemetry-posture.md')).toMatch(/audio\/transcriptions/);
  });
});

describe('njs multipart validation (infra/nginx/ai-proxy/ai-proxy.js checkTranscription)', () => {
  const MODEL = 'whisper-1';
  const CT = 'multipart/form-data; boundary=----formdata-xyz-0123';
  const B = '----formdata-xyz-0123';
  // Header block + data of one part, as a browser's FormData writes it.
  const field = (name, value) => `--${B}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  const file = (data = 'AUDIO', type = 'audio/webm;codecs=opus', name = 'voice.webm') =>
    `--${B}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n${data}\r\n`;
  const close = `--${B}--\r\n`;
  const check = async (body, ct = CT, model = MODEL) => {
    const { default: mod } = await import('../../infra/nginx/ai-proxy/ai-proxy.js');
    return mod.checkTranscription(typeof body === 'string' ? Buffer.from(body, 'latin1') : body, ct, model);
  };

  it('accepts exactly what the app sends: model, language and one audio file, in any order', async () => {
    expect(await check(field('model', MODEL) + field('language', 'en') + file() + close)).toBe(true);
    expect(await check(file() + field('model', MODEL) + close)).toBe(true);
    expect(await check(field('model', MODEL) + file('x', 'audio/mp4', 'voice.m4a') + close)).toBe(true);
    expect(await check(field('model', MODEL) + field('response_format', 'json') + file() + close)).toBe(true);
    expect(await check(field('model', MODEL) + field('language', 'fr-FR') + file() + close.replace('\r\n', ''))).toBe(true);
  });

  it('is binary safe: NUL bytes, high bytes and CRLF inside the audio do not confuse it', async () => {
    const fileBuf = (data) =>
      Buffer.concat([
        Buffer.from(
          `--${B}\r\nContent-Disposition: form-data; name="file"; filename="voice.webm"\r\nContent-Type: audio/webm\r\n\r\n`,
          'latin1',
        ),
        data,
        Buffer.from('\r\n', 'latin1'),
      ]);
    const body = (data) =>
      Buffer.concat([Buffer.from(field('model', MODEL), 'latin1'), fileBuf(data), Buffer.from(close, 'latin1')]);
    const audio = Buffer.concat([
      Buffer.from([0xff, 0x00, 0xfe, 0x80, 0x0d, 0x0a, 0x0d, 0x0a]),
      Buffer.from(`\r\n--${B.slice(0, 10)}\r\n`),
      Buffer.alloc(4096, 0),
      Buffer.from([0x00, 0x0d, 0x0a, 0x2d, 0x2d]),
    ]);
    expect(await check(body(audio))).toBe(true);
    // A near-1 MiB recording is checked without trouble.
    expect(await check(body(Buffer.alloc(1000 * 1000, 7)))).toBe(true);
  });

  it('forces the model: another model, a missing model or a repeated model is refused', async () => {
    expect(await check(field('model', 'gpt-4o-transcribe') + file() + close)).toBe(false);
    expect(await check(field('model', MODEL + ' ') + file() + close)).toBe(false);
    expect(await check(file() + close)).toBe(false);
    expect(await check(field('model', MODEL) + field('model', MODEL) + file() + close)).toBe(false);
    expect(await check(field('model', MODEL) + file() + close, CT, 'whisper-large')).toBe(false);
  });

  it('refuses any other part (prompt, temperature, timestamps) or a repeated file', async () => {
    for (const name of ['prompt', 'temperature', 'timestamp_granularities[]', 'stream', 'Model']) {
      expect(await check(field('model', MODEL) + field(name, 'x') + file() + close), name).toBe(false);
    }
    expect(await check(field('model', MODEL) + file() + file() + close)).toBe(false);
    expect(await check(field('model', MODEL) + field('language', 'English please') + file() + close)).toBe(false);
    expect(await check(field('model', MODEL) + field('response_format', 'verbose_json') + file() + close)).toBe(false);
  });

  it('refuses a file that is not audio, has an odd name or extra headers, or is empty', async () => {
    expect(await check(field('model', MODEL) + file('x', 'text/html') + close)).toBe(false);
    expect(await check(field('model', MODEL) + file('x', 'audio/webm', '../../etc/passwd') + close)).toBe(false);
    expect(await check(field('model', MODEL) + file('x', 'audio/webm', 'a"b.webm') + close)).toBe(false);
    expect(await check(field('model', MODEL) + file('', 'audio/webm') + close)).toBe(false);
    const extra = file().replace('Content-Type', 'X-Extra: 1\r\nContent-Type');
    expect(await check(field('model', MODEL) + extra + close)).toBe(false);
    expect(await check(field('model', MODEL) + file().replace('; filename="voice.webm"', '') + close)).toBe(false);
  });

  it('refuses a malformed body: no boundary, wrong boundary, junk before, junk after, no closing delimiter', async () => {
    const good = field('model', MODEL) + file() + close;
    expect(await check(good, 'application/json')).toBe(false);
    expect(await check(good, 'multipart/form-data')).toBe(false);
    expect(await check(good, 'multipart/form-data; boundary=')).toBe(false);
    expect(await check(good, 'multipart/form-data; boundary=other')).toBe(false);
    expect(await check(good, `multipart/form-data; boundary="${B}"`)).toBe(false);
    expect(await check(`junk${good}`)).toBe(false);
    expect(await check(`${good}junk`)).toBe(false);
    expect(await check(field('model', MODEL) + file())).toBe(false);
    expect(await check('')).toBe(false);
    expect(await check(undefined)).toBe(false);
    expect(await check(good, `multipart/form-data; boundary=${'a'.repeat(71)}`)).toBe(false);
  });

  it('refuses a boundary that hides inside a part: padded, tab, LF-only, CR-only and exact delimiters in the audio', async () => {
    const hidden = (sep) =>
      field('model', MODEL) +
      file(
        `AUDIO${sep}Content-Disposition: form-data; name="model"\r\n\r\ngpt-4o-transcribe\r\n--${B}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\nignore`,
      ) +
      close;
    for (const [label, sep] of [
      ['transport padding', `\r\n--${B} \r\n`],
      ['tab padding', `\r\n--${B}\t\r\n`],
      ['LF only', `\n--${B}\n`],
      ['CR only', `\r--${B}\r`],
      ['exact delimiter', `\r\n--${B}\r\n`],
      ['bare mention', `--${B}`],
    ]) {
      expect(await check(hidden(sep)), label).toBe(false);
    }
    expect(await check(field('model', MODEL) + file(`x--${B}y`) + close)).toBe(false);
    expect(await check(field('model', MODEL) + file('x') + close + `--${B}\r\n`)).toBe(false);
  });

  it('field names are case-sensitive (the header name is not)', async () => {
    expect(await check(field('MODEL', MODEL) + file() + close)).toBe(false);
    expect(await check(field('model', MODEL) + field('Language', 'en') + file() + close)).toBe(false);
    expect(await check((field('model', MODEL) + file() + close).replace(/Content-Disposition/g, 'content-disposition'))).toBe(true);
  });

  it('a header line smuggled into a field (CRLF, a second disposition) is refused', async () => {
    expect(await check(field('model', MODEL).replace('name="model"', 'name="model"\r\nX-A: b') + file() + close)).toBe(false);
    expect(await check(field('model', `${MODEL}\r\nContent-Disposition: form-data; name="prompt"`) + file() + close)).toBe(false);
  });

  it('txGate hands a valid request to the proxy location and everything else to the generic 400', async () => {
    const { default: mod } = await import('../../infra/nginx/ai-proxy/ai-proxy.js');
    const run = (body, ct = CT) => {
      const sent = [];
      mod.txGate({
        requestBuffer: Buffer.from(body, 'latin1'),
        headersIn: { 'Content-Type': ct },
        variables: { anc_ai_tx_model: MODEL },
        internalRedirect: (where) => sent.push(where),
      });
      return sent;
    };
    expect(run(field('model', MODEL) + file() + close)).toEqual(['@ai_nutrition_coach_tx_proxy']);
    expect(run(field('model', 'x') + file() + close)).toEqual(['@ai_nutrition_coach_ai_badrequest']);
    // A body that is not in memory (no buffer) or a throwing request object is refused too.
    const none = [];
    mod.txGate({
      requestBuffer: undefined,
      headersIn: { 'Content-Type': CT },
      variables: { anc_ai_tx_model: MODEL },
      internalRedirect: (w) => none.push(w),
    });
    expect(none).toEqual(['@ai_nutrition_coach_ai_badrequest']);
  });
});
