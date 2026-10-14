// Static facts about the self-host definition (`infra/`, `bin/ai-nutrition-coach`) that
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
    headers = _read(
      'infra/nginx/templates/ai-nutrition-coach-headers.inc.template',
    );
    vhost = _read('infra/nginx/templates/ai-nutrition-coach.conf.template');
    caddyfile = _read('infra/Caddyfile');
  });

  test('the app port is published on loopback by default', () {
    expect(compose, contains(r'${AI_NUTRITION_COACH_BIND:-127.0.0.1}'));
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
      r"'self' https://world.openfoodfacts.org ${AI_NUTRITION_COACH_CONNECT_SRC_EXTRA}",
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
    expect(dockerfile, contains('pnpm --filter @anc/web build'));
    expect(dockerfile, contains('bash tools/check_no_secrets_in_build.sh'));
    expect(dockerfile, contains('bash tools/check_no_external_hosts.sh'));
  });

  group('access log (privacy audit PV9)', () {
    late String nginxConf;

    setUpAll(() => nginxConf = _read('infra/nginx/nginx.conf'));

    test('nginx.conf logs nothing by itself: it only includes the rendered '
        'file', () {
      expect(
        nginxConf,
        contains('include /tmp/ai-nutrition-coach-access-log.inc;'),
      );
      expect(
        RegExp(r'^\s*access_log\b', multiLine: true).hasMatch(nginxConf),
        isFalse,
        reason: 'no hard-coded access_log (the mode comes from the env)',
      );
    });

    test('no nginx config or template ever logs the User-Agent or Referer', () {
      for (final f in [
        'infra/nginx/nginx.conf',
        'infra/nginx/templates/ai-nutrition-coach.conf.template',
        'infra/nginx/templates/ai-nutrition-coach-headers.inc.template',
        'infra/nginx/docker-entrypoint.d/10-render-access-log.sh',
      ]) {
        final text = _read(f);
        expect(text, isNot(contains(r'$http_user_agent')), reason: f);
        expect(text, isNot(contains(r'$http_referer')), reason: f);
        expect(
          text,
          isNot(contains(r'$request ')),
          reason: '$f (query string)',
        );
      }
    });

    test('the image and both compose files default the mode to off', () {
      expect(dockerfile, contains('AI_NUTRITION_COACH_ACCESS_LOG="off"'));
      expect(dockerfile, contains('10-render-access-log.sh'));
      expect(
        compose,
        contains(
          r'AI_NUTRITION_COACH_ACCESS_LOG: ${AI_NUTRITION_COACH_ACCESS_LOG:-off}',
        ),
      );
      expect(
        _read('infra/docker-compose.traefik.yml'),
        contains(
          r'AI_NUTRITION_COACH_ACCESS_LOG: ${AI_NUTRITION_COACH_ACCESS_LOG:-off}',
        ),
      );
    });

    // The entrypoint script is POSIX sh and needs no Docker.
    Future<(int, String, String)> render(String? mode) async {
      final dir = Directory.systemTemp.createTempSync(
        'ai_nutrition_coach_log_',
      );
      addTearDown(() => dir.deleteSync(recursive: true));
      final out = '${dir.path}/log.inc';
      final r = await Process.run(
        'sh',
        [
          '${repoRoot().path}/infra/nginx/docker-entrypoint.d/10-render-access-log.sh',
        ],
        environment: {
          'PATH': Platform.environment['PATH'] ?? '/usr/bin:/bin',
          'AI_NUTRITION_COACH_ACCESS_LOG_OUT': out,
          'AI_NUTRITION_COACH_ACCESS_LOG': ?mode,
        },
        includeParentEnvironment: false,
      );
      final file = File(out);
      return (
        r.exitCode,
        file.existsSync() ? file.readAsStringSync() : '',
        '${r.stderr}',
      );
    }

    test('unset or off: access_log off, nothing else', () async {
      for (final mode in [null, 'off', '']) {
        final (code, conf, _) = await render(mode);
        expect(code, 0, reason: 'mode=$mode');
        expect(conf, contains('access_log off;'));
        expect(conf, isNot(contains('log_format')));
        expect(conf, isNot(contains('/dev/stdout')));
      }
    });

    test('on: truncated address, no User-Agent, no query string, no '
        'healthcheck lines', () async {
      final (code, conf, _) = await render('on');
      expect(code, 0);
      final format = RegExp(
        r'^log_format .*$',
        multiLine: true,
      ).firstMatch(conf)!.group(0)!;
      expect(format, contains(r'$ai_nutrition_coach_log_ip'));
      expect(format, isNot(contains(r'$remote_addr')));
      expect(format, contains(r'$uri'));
      expect(format, isNot(contains(r'$request ')));
      expect(format, isNot(contains('user_agent')));
      expect(format, isNot(contains('referer')));
      expect(conf, contains(r'if=$ai_nutrition_coach_loggable'));
      // IPv4 keeps three octets; IPv6 keeps at most two groups.
      expect(conf, contains(r'\.[0-9]+$"'));
      expect(conf, contains(r'$net.0;'));
      expect(conf, contains(r'$net::;'));
      expect(conf, contains('127.0.0.1  0;'));
    });

    test('the address map keeps /24 for IPv4, at most /32 for IPv6, `::` '
        'for anything else (regexes taken from the rendered file)', () async {
      final (_, conf, _) = await render('on');
      final rules = [
        for (final m in RegExp(
          r'^\s*"~(.+)"\s+\$net(\.0|::);',
          multiLine: true,
        ).allMatches(conf))
          (RegExp(m.group(1)!), m.group(2)!),
      ];
      expect(rules, hasLength(2));
      String anon(String addr) {
        for (final (re, suffix) in rules) {
          final hit = re.firstMatch(addr);
          if (hit != null) return '${hit.namedGroup('net')}$suffix';
        }
        return '::';
      }

      expect(anon('192.168.97.45'), '192.168.97.0');
      expect(anon('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8::');
      expect(anon('fe80:1:2:3:4:5:6:7'), 'fe80:1::');
      expect(anon('2001::1'), '::', reason: 'compressed: not recognised');
      expect(anon('::1'), '::');
      expect(anon('::ffff:192.0.2.1'), '::');
      expect(anon('not an address'), '::');
      // Nothing of the third group or later survives.
      expect(anon('2001:db8:85a3::1'), isNot(contains('85a3')));
      expect(conf, contains('default'));
    });

    test('full: the whole address is logged, still no User-Agent', () async {
      final (code, conf, _) = await render('full');
      expect(code, 0);
      final format = RegExp(
        r'^log_format .*$',
        multiLine: true,
      ).firstMatch(conf)!.group(0)!;
      expect(format, contains(r'$remote_addr'));
      expect(format, isNot(contains('user_agent')));
    });

    test('anything else refuses to start', () async {
      for (final bad in ['yes', 'ON', 'on; access_log /x', 'true']) {
        final (code, conf, err) = await render(bad);
        expect(code, 1, reason: bad);
        expect(conf, isEmpty);
        expect(err, contains('AI_NUTRITION_COACH_ACCESS_LOG'));
      }
    });

    test(
      'bin/ai-nutrition-coach validates the mode before touching Docker',
      () async {
        final r = await Process.run(
          'sh',
          ['${repoRoot().path}/bin/ai-nutrition-coach', 'up'],
          environment: {
            'PATH': Platform.environment['PATH'] ?? '/usr/bin:/bin',
            'AI_NUTRITION_COACH_ACCESS_LOG': 'verbose',
          },
          includeParentEnvironment: false,
        );
        expect(r.exitCode, 42, reason: '${r.stderr}');
        expect(r.stderr, contains('AI_NUTRITION_COACH_ACCESS_LOG'));
      },
    );
  });

  group('PWA serving (ADR-0003)', () {
    test(
      'sw.js and the precache manifest are rendered at start and always revalidated',
      () {
        for (final f in ['sw.js', 'precache-manifest.json']) {
          expect(
            RegExp(
              'location = /${RegExp.escape(f)} \\{[^}]*alias /tmp/ai-nutrition-coach-pwa/${RegExp.escape(f)};[^}]*Cache-Control "no-cache"',
            ).hasMatch(vhost),
            isTrue,
            reason: f,
          );
        }
        final block = RegExp(
          r'location ~ \^/\(([^)]*)\)\$ \{\n(?:.*\n)*?\s*add_header Cache-Control "no-cache";',
        ).allMatches(vhost).map((m) => m.group(1)!).join('|');
        expect(block, contains(r'manifest\.webmanifest'));
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
      dynamic = _read('infra/traefik/ai-nutrition-coach-dynamic.yml');
      script = _read('bin/ai-nutrition-coach');
    });

    test('publishes NO port and joins the external Traefik network', () {
      expect(traefik, isNot(contains('ports:')));
      expect(traefik, isNot(contains('network_mode')));
      expect(traefik, contains('external: true'));
      expect(
        traefik,
        contains(r'${AI_NUTRITION_COACH_TRAEFIK_NETWORK:-traefik}'),
      );
      for (final overlay in [certresolver, allowlist]) {
        expect(overlay, isNot(contains('ports:')));
      }
    });

    test('keeps the same container hardening as the base file', () {
      expect(traefik, contains('read_only: true'));
      expect(traefik, contains('cap_drop: [ALL]'));
      expect(traefik, contains('no-new-privileges:true'));
      expect(traefik, contains('/tmp:rw,noexec,nosuid'));
      expect(traefik, contains(r'${AI_NUTRITION_COACH_CONNECT_SRC_EXTRA:-}'));
    });

    test('routes the domain over HTTPS to port 8080', () {
      expect(traefik, contains('traefik.enable: "true"'));
      expect(
        traefik,
        contains(
          r'traefik.http.routers.ai-nutrition-coach.rule: Host(`${AI_NUTRITION_COACH_DOMAIN:?',
        ),
      );
      expect(
        traefik,
        contains(
          r'traefik.http.routers.ai-nutrition-coach.entrypoints: ${AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT:-websecure}',
        ),
      );
      expect(
        traefik,
        contains('traefik.http.routers.ai-nutrition-coach.tls: "true"'),
      );
      expect(
        traefik,
        contains(
          'traefik.http.services.ai-nutrition-coach.loadbalancer.server.port: "8080"',
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
            r'stsIncludeSubdomains: ${AI_NUTRITION_COACH_TRAEFIK_HSTS_SUBDOMAINS:-false}',
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
        contains('traefik.http.routers.ai-nutrition-coach.tls.certresolver'),
      );
      expect(
        certresolver,
        contains(r'${AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER:?'),
      );
    });

    test('the allow-list overlay is ipAllowList, not basic auth', () {
      expect(allowlist, contains('ipallowlist.sourcerange'));
      expect(allowlist, isNot(contains('basicauth')));
      expect(
        allowlist,
        contains(
          'traefik.http.routers.ai-nutrition-coach.middlewares: ai-nutrition-coach-hsts,ai-nutrition-coach-allow',
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

    test('bin/ai-nutrition-coach has --traefik with strict validation', () {
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
      ['${repoRoot().path}/bin/ai-nutrition-coach', ...args],
      environment: {
        'PATH': Platform.environment['PATH'] ?? '/usr/bin:/bin',
        ...env,
      },
      includeParentEnvironment: false,
    );

    test('refuses without a domain (exit 41)', () async {
      final r = await up({});
      expect(r.exitCode, 41);
      expect(r.stderr, contains('AI_NUTRITION_COACH_DOMAIN'));
    });

    for (final bad in [
      {'AI_NUTRITION_COACH_DOMAIN': 'plate.example.com/x'},
      {'AI_NUTRITION_COACH_DOMAIN': 'a b'},
      {'AI_NUTRITION_COACH_DOMAIN': r'x`),Host(`evil.com'},
      {
        'AI_NUTRITION_COACH_DOMAIN': 'ok.example.com',
        'AI_NUTRITION_COACH_TRAEFIK_NETWORK': 'a b',
      },
      {
        'AI_NUTRITION_COACH_DOMAIN': 'ok.example.com',
        'AI_NUTRITION_COACH_TRAEFIK_NETWORK': '-lead',
      },
      {
        'AI_NUTRITION_COACH_DOMAIN': 'ok.example.com',
        'AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT': 'web;x',
      },
      {
        'AI_NUTRITION_COACH_DOMAIN': 'ok.example.com',
        'AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT': r'$(id)',
      },
      {
        'AI_NUTRITION_COACH_DOMAIN': 'ok.example.com',
        'AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER': 'le,x',
      },
      {
        'AI_NUTRITION_COACH_DOMAIN': 'ok.example.com',
        'AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER': 'le\nx',
      },
      {
        'AI_NUTRITION_COACH_DOMAIN': 'ok.example.com',
        'AI_NUTRITION_COACH_TRAEFIK_HSTS_SUBDOMAINS': 'yes',
      },
      {
        'AI_NUTRITION_COACH_DOMAIN': 'ok.example.com',
        'AI_NUTRITION_COACH_TRAEFIK_ALLOWLIST': '1.2.3.4',
      },
      {
        'AI_NUTRITION_COACH_DOMAIN': 'ok.example.com',
        'AI_NUTRITION_COACH_TRAEFIK_ALLOWLIST': '10.0.0.0/8,evil',
      },
      {
        'AI_NUTRITION_COACH_DOMAIN': 'ok.example.com',
        'AI_NUTRITION_COACH_CONNECT_SRC_EXTRA':
            "https://a.example'; script-src *",
      },
    ]) {
      test('refuses invalid settings (exit 42): $bad', () async {
        final r = await up(bad);
        expect(r.exitCode, 42, reason: '${r.stderr}');
        expect(r.stderr, startsWith('ai-nutrition-coach:'));
      });
    }

    test(
      'valid settings pass validation (the next failure is Docker, not input)',
      () async {
        final r = await up({
          'AI_NUTRITION_COACH_DOMAIN': 'plate.example.com',
          'AI_NUTRITION_COACH_TRAEFIK_NETWORK': 'proxy_net.1',
          'AI_NUTRITION_COACH_TRAEFIK_ENTRYPOINT': 'websecure',
          'AI_NUTRITION_COACH_TRAEFIK_CERTRESOLVER': 'letsencrypt',
          'AI_NUTRITION_COACH_TRAEFIK_ALLOWLIST':
              '192.168.1.0/24,100.64.0.0/10,fd00::/8',
          'AI_NUTRITION_COACH_TRAEFIK_HSTS_SUBDOMAINS': 'true',
          'AI_NUTRITION_COACH_CONNECT_SRC_EXTRA': 'https://api.openai.com',
        });
        // 10 = no docker here; 43 = docker present but no such network. Never 41/42.
        expect(r.exitCode, anyOf(10, 43), reason: '${r.stderr}');
      },
    );
  });
}
