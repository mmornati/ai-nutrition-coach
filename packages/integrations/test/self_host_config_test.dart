// Static facts about the self-host definition (`infra/`, `bin/openplate`) that
// docs/self-host.md and the README trust table promise. The container-level
// proof is `scripts/smoke_self_host.sh` (needs Docker, run in CI); this pins
// the same promises at the config level so a regression fails `melos run test`.

import 'dart:io';

import 'package:test/test.dart';

import '_support/repo_root.dart';

/// A repo file with comment lines (`# ...` / blank) removed, so a comment can
/// never satisfy or break an assertion about the real configuration.
String _read(String path) => File('${repoRoot().path}/$path')
    .readAsLinesSync()
    .where(
      (l) => !l.trimLeft().startsWith('#') && !l.trimLeft().startsWith('//'),
    )
    .join('\n');

void main() {
  late String compose;
  late String dockerfile;
  late String headers;
  late String vhost;
  late String caddyfile;

  setUpAll(() {
    compose = _read('infra/docker-compose.yml');
    dockerfile = _read('infra/Dockerfile');
    headers = _read('infra/nginx/templates/openplate-headers.inc.template');
    vhost = _read('infra/nginx/templates/openplate.conf.template');
    caddyfile = _read('infra/Caddyfile');
  });

  test('the app port is published on loopback by default', () {
    expect(compose, contains(r'${OPENPLATE_BIND:-127.0.0.1}'));
  });

  test(
    'the app container is read-only, capability-free, no-new-privileges',
    () {
      expect(compose, contains('read_only: true'));
      expect(compose, contains('cap_drop: [ALL]'));
      expect(compose, contains('no-new-privileges:true'));
    },
  );

  test('every image is pinned by digest', () {
    final froms = RegExp(
      r'^FROM\s+(\S+)',
      multiLine: true,
    ).allMatches(dockerfile).map((m) => m.group(1)!);
    expect(froms, hasLength(2));
    for (final image in froms) {
      expect(image, contains('@sha256:'), reason: image);
    }
    expect(compose, contains('caddy:'));
    expect(
      RegExp(r'image:\s*caddy\S*@sha256:[0-9a-f]{64}').hasMatch(compose),
      isTrue,
    );
  });

  test('the served image runs as the unprivileged nginx user', () {
    expect(dockerfile, contains('USER 101'));
  });

  test('the server holds no data and proxies nothing', () {
    expect(vhost, isNot(contains('proxy_pass')));
    expect(vhost, isNot(contains('resolver')));
    // the only volumes are Caddy's certificate state
    expect(
      RegExp(
        r'^volumes:\n((?:  .*(?:\n|$))+)',
        multiLine: true,
      ).firstMatch(compose)!.group(1),
      allOf(contains('caddy-data'), contains('caddy-config')),
    );
  });

  test('the CSP has no inline script, no blanket https:, no CDN', () {
    final csp = RegExp(
      r'Content-Security-Policy "([^"]*)"',
    ).firstMatch(headers)!.group(1)!;
    final script = RegExp(r'script-src ([^;]*);').firstMatch(csp)!.group(1)!;
    expect(script, "'self' 'wasm-unsafe-eval'");
    expect(csp, contains("default-src 'self'"));
    expect(csp, contains("object-src 'none'"));
    expect(csp, contains("frame-ancestors 'none'"));
    final connect = RegExp(r'connect-src ([^;]*);').firstMatch(csp)!.group(1)!;
    expect(
      connect,
      r"'self' https://world.openfoodfacts.org ${OPENPLATE_CONNECT_SRC_EXTRA}",
    );
    expect(RegExp(r'\bhttps:(?!//)').hasMatch(csp), isFalse);
  });

  test(
    'security headers ship on every response and only GET/HEAD is served',
    () {
      for (final h in [
        'nosniff',
        'Referrer-Policy "no-referrer"',
        'X-Frame-Options "DENY"',
        'Cross-Origin-Opener-Policy "same-origin"',
      ]) {
        expect(headers, contains(h));
      }
      expect(vhost, contains(r'return 405'));
      expect(vhost, contains('immutable'));
    },
  );

  test('TLS is opt-in through Caddy with HSTS', () {
    expect(compose, contains('profiles: ["tls"]'));
    expect(caddyfile, contains('Strict-Transport-Security'));
  });

  test('the image build fails on a leaked secret or a third-party host', () {
    expect(dockerfile, contains('melos run build:web'));
    final pubspec = _read('pubspec.yaml');
    expect(pubspec, contains('check_no_secrets_in_build.sh --web-only'));
    expect(pubspec, contains('check_no_external_hosts.sh'));
  });

  group('PWA serving (ADR-0003)', () {
    test(
      'sw.js and the precache manifest are rendered at start and always revalidated',
      () {
        for (final f in ['sw.js', 'precache-manifest.json']) {
          expect(
            RegExp(
              'location = /${RegExp.escape(f)} \\{[^}]*alias /tmp/openplate-pwa/${RegExp.escape(f)};[^}]*Cache-Control "no-cache"',
            ).hasMatch(vhost),
            isTrue,
            reason: f,
          );
        }
        final block = RegExp(
          r'location ~ \^/\(([^)]*)\)\$ \{\n(?:.*\n)*?\s*add_header Cache-Control "no-cache";',
        ).allMatches(vhost).map((m) => m.group(1)!).join('|');
        expect(block, contains(r'manifest\.json'));
        expect(block, contains(r'index\.html'));
      },
    );

    test('the versioned zxing decoder is immutable, like the sqlite wasm', () {
      expect(
        RegExp(
          r'location ~ \^/zxing/\[0-9\]\[0-9\.\]\*/ \{[^}]*immutable',
        ).hasMatch(vhost),
        isTrue,
      );
    });

    test(
      'workers are allowed from our origin only; the strict CSP is intact',
      () {
        final csp = RegExp(
          r'Content-Security-Policy "([^"]*)"',
        ).firstMatch(headers)!.group(1)!;
        expect(csp, contains("worker-src 'self' blob:"));
        expect(csp, contains("manifest-src 'self'"));
        expect(
          RegExp(r"script-src ([^;]*);").firstMatch(csp)!.group(1),
          "'self' 'wasm-unsafe-eval'",
        );
      },
    );

    test('there is no inline script in index.html (the CSP forbids it)', () {
      final index = File(
        '${repoRoot().path}/apps/client/web/index.html',
      ).readAsStringSync();
      for (final m in RegExp(r'<script\b[^>]*>').allMatches(index)) {
        expect(m.group(0), contains('src='));
      }
    });
  });

  group('Traefik deployment (docs/pwa.md)', () {
    late String traefik;
    late String certresolver;
    late String allowlist;
    late String dynamic;
    late String script;

    setUpAll(() {
      traefik = _read('infra/docker-compose.traefik.yml');
      certresolver = _read('infra/docker-compose.traefik-certresolver.yml');
      allowlist = _read('infra/docker-compose.traefik-allowlist.yml');
      dynamic = _read('infra/traefik/openplate-dynamic.yml');
      script = _read('bin/openplate');
    });

    test('publishes NO port and joins the external Traefik network', () {
      expect(traefik, isNot(contains('ports:')));
      expect(traefik, isNot(contains('network_mode')));
      expect(traefik, contains('external: true'));
      expect(traefik, contains(r'${OPENPLATE_TRAEFIK_NETWORK:-traefik}'));
      for (final overlay in [certresolver, allowlist]) {
        expect(overlay, isNot(contains('ports:')));
      }
    });

    test('keeps the same container hardening as the base file', () {
      expect(traefik, contains('read_only: true'));
      expect(traefik, contains('cap_drop: [ALL]'));
      expect(traefik, contains('no-new-privileges:true'));
      expect(traefik, contains('/tmp:rw,noexec,nosuid'));
      expect(traefik, contains(r'${OPENPLATE_CONNECT_SRC_EXTRA:-}'));
    });

    test('routes the domain over HTTPS to port 8080', () {
      expect(traefik, contains('traefik.enable: "true"'));
      expect(
        traefik,
        contains(
          r'traefik.http.routers.openplate.rule: Host(`${OPENPLATE_DOMAIN:?',
        ),
      );
      expect(
        traefik,
        contains(
          r'traefik.http.routers.openplate.entrypoints: ${OPENPLATE_TRAEFIK_ENTRYPOINT:-websecure}',
        ),
      );
      expect(traefik, contains('traefik.http.routers.openplate.tls: "true"'));
      expect(
        traefik,
        contains(
          'traefik.http.services.openplate.loadbalancer.server.port: "8080"',
        ),
      );
    });

    test(
      'HSTS only: one year, no preload, nothing that would replace the CSP',
      () {
        expect(traefik, contains('headers.stsSeconds: "31536000"'));
        expect(traefik, contains('headers.stsPreload: "false"'));
        expect(
          traefik,
          contains(
            r'stsIncludeSubdomains: ${OPENPLATE_TRAEFIK_HSTS_SUBDOMAINS:-false}',
          ),
        );
        for (final forbidden in [
          'customResponseHeaders',
          'contentSecurityPolicy',
          'customFrameOptions',
          'frameDeny',
          'contentTypeNosniff',
          'referrerPolicy',
          'permissionsPolicy',
          'basicauth',
        ]) {
          expect(
            traefik.toLowerCase(),
            isNot(contains(forbidden.toLowerCase())),
            reason: forbidden,
          );
        }
      },
    );

    test('the cert resolver is an overlay, so no empty label can exist', () {
      expect(traefik, isNot(contains('certresolver')));
      expect(
        certresolver,
        contains('traefik.http.routers.openplate.tls.certresolver'),
      );
      expect(certresolver, contains(r'${OPENPLATE_TRAEFIK_CERTRESOLVER:?'));
    });

    test('the allow-list overlay is ipAllowList, not basic auth', () {
      expect(allowlist, contains('ipallowlist.sourcerange'));
      expect(allowlist, isNot(contains('basicauth')));
      expect(
        allowlist,
        contains(
          'traefik.http.routers.openplate.middlewares: openplate-hsts,openplate-allow',
        ),
      );
    });

    test('the host-Traefik example targets loopback and keeps HSTS', () {
      expect(dynamic, contains('http://127.0.0.1:8080'));
      expect(dynamic, contains('stsSeconds: 31536000'));
      expect(dynamic, contains('stsPreload: false'));
      expect(dynamic, contains('ipAllowList'));
      expect(dynamic, isNot(contains('0.0.0.0')));
    });

    test('bin/openplate has --traefik with strict validation', () {
      expect(script, contains('--traefik)'));
      expect(script, contains('validate_traefik'));
      expect(script, contains('validate_domain'));
      expect(script, contains('docker network inspect'));
      expect(script, contains('docker-compose.traefik-certresolver.yml'));
      expect(script, contains('docker-compose.traefik-allowlist.yml'));
    });

    // The refusals run the real script (POSIX sh); validation happens before
    // Docker is needed, so they work on a machine without it.
    Future<ProcessResult> up(
      Map<String, String> env, {
      List<String> args = const ['up', '--traefik'],
    }) => Process.run(
      'sh',
      ['${repoRoot().path}/bin/openplate', ...args],
      environment: {
        'PATH': Platform.environment['PATH'] ?? '/usr/bin:/bin',
        ...env,
      },
      includeParentEnvironment: false,
    );

    test('refuses without a domain (exit 41)', () async {
      final r = await up({});
      expect(r.exitCode, 41);
      expect(r.stderr, contains('OPENPLATE_DOMAIN'));
    });

    for (final bad in [
      {'OPENPLATE_DOMAIN': 'plate.example.com/x'},
      {'OPENPLATE_DOMAIN': 'a b'},
      {'OPENPLATE_DOMAIN': r'x`),Host(`evil.com'},
      {
        'OPENPLATE_DOMAIN': 'ok.example.com',
        'OPENPLATE_TRAEFIK_NETWORK': 'a b',
      },
      {
        'OPENPLATE_DOMAIN': 'ok.example.com',
        'OPENPLATE_TRAEFIK_NETWORK': '-lead',
      },
      {
        'OPENPLATE_DOMAIN': 'ok.example.com',
        'OPENPLATE_TRAEFIK_ENTRYPOINT': 'web;x',
      },
      {
        'OPENPLATE_DOMAIN': 'ok.example.com',
        'OPENPLATE_TRAEFIK_ENTRYPOINT': r'$(id)',
      },
      {
        'OPENPLATE_DOMAIN': 'ok.example.com',
        'OPENPLATE_TRAEFIK_CERTRESOLVER': 'le,x',
      },
      {
        'OPENPLATE_DOMAIN': 'ok.example.com',
        'OPENPLATE_TRAEFIK_CERTRESOLVER': 'le\nx',
      },
      {
        'OPENPLATE_DOMAIN': 'ok.example.com',
        'OPENPLATE_TRAEFIK_HSTS_SUBDOMAINS': 'yes',
      },
      {
        'OPENPLATE_DOMAIN': 'ok.example.com',
        'OPENPLATE_TRAEFIK_ALLOWLIST': '1.2.3.4',
      },
      {
        'OPENPLATE_DOMAIN': 'ok.example.com',
        'OPENPLATE_TRAEFIK_ALLOWLIST': '10.0.0.0/8,evil',
      },
      {
        'OPENPLATE_DOMAIN': 'ok.example.com',
        'OPENPLATE_CONNECT_SRC_EXTRA': "https://a.example'; script-src *",
      },
    ]) {
      test('refuses invalid settings (exit 42): $bad', () async {
        final r = await up(bad);
        expect(r.exitCode, 42, reason: '${r.stderr}');
        expect(r.stderr, startsWith('openplate:'));
      });
    }

    test(
      'valid settings pass validation (the next failure is Docker, not input)',
      () async {
        final r = await up({
          'OPENPLATE_DOMAIN': 'plate.example.com',
          'OPENPLATE_TRAEFIK_NETWORK': 'proxy_net.1',
          'OPENPLATE_TRAEFIK_ENTRYPOINT': 'websecure',
          'OPENPLATE_TRAEFIK_CERTRESOLVER': 'letsencrypt',
          'OPENPLATE_TRAEFIK_ALLOWLIST':
              '192.168.1.0/24,100.64.0.0/10,fd00::/8',
          'OPENPLATE_TRAEFIK_HSTS_SUBDOMAINS': 'true',
          'OPENPLATE_CONNECT_SRC_EXTRA': 'https://api.openai.com',
        });
        // 10 = no docker here; 43 = docker present but no such network. Never 41/42.
        expect(r.exitCode, anyOf(10, 43), reason: '${r.stderr}');
      },
    );
  });
}
