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
}
