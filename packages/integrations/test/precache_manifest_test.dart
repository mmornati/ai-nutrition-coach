// The precache-manifest generator and the service worker it bakes a build id
// into (ADR-0003, task: offline + updates). The generator is a repo tool;
// like the other tools it is unit-tested here against throwaway bundles, and
// the service worker's non-negotiable behaviours are pinned against the real
// template.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../../../tools/generate_precache_manifest.dart';
import '_support/repo_root.dart';

const _required = [
  'index.html',
  'flutter.js',
  'flutter_bootstrap.js',
  'main.dart.js',
  'manifest.json',
];

void main() {
  late Directory web;

  void write(String path, [String body = 'x']) {
    File('${web.path}/$path')
      ..createSync(recursive: true)
      ..writeAsStringSync(body);
  }

  void bundle() {
    for (final f in _required) {
      write(f, 'content of $f');
    }
    write('assets/AssetManifest.bin', 'assets');
    write('assets/fonts/Roboto-Regular.ttf', 'font');
    write('icons/Icon-192.png', 'png');
    write('canvaskit/canvaskit.js', 'js');
    write('canvaskit/canvaskit.wasm', 'wasm');
    write('canvaskit/chromium/canvaskit.wasm', 'wasm-chromium');
    write('sqlite3mc-3.5.1.wasm', 'sqlite');
    write('zxing/3.1.1/reader.js', 'zxing');
    write('zxing/3.1.1/zxing_reader.wasm', 'zxing-wasm');
    // Never precached:
    write('canvaskit/skwasm.wasm', 'skwasm');
    write('canvaskit/skwasm_heavy.js', 'skwasm');
    write('canvaskit/wimp.wasm', 'wimp');
    write('canvaskit/experimental_webparagraph/canvaskit.js', 'ewp');
    write('canvaskit/canvaskit.js.symbols', 'symbols');
    write('main.dart.js.map', 'map');
    write('flutter_service_worker.js', 'old flutter sw');
    write('version.json', '{}');
    write('.last_build_id', 'abc');
  }

  setUp(() {
    web = Directory.systemTemp.createTempSync('ai_nutrition_coach_precache_');
    bundle();
  });
  tearDown(() => web.deleteSync(recursive: true));

  group('what is precached', () {
    test('everything needed to boot offline, nothing else', () {
      final urls = collectPrecacheEntries(web).map((e) => e.url).toList();
      expect(urls, [
        'assets/AssetManifest.bin',
        'assets/fonts/Roboto-Regular.ttf',
        'canvaskit/canvaskit.js',
        'canvaskit/canvaskit.wasm',
        'canvaskit/chromium/canvaskit.wasm',
        'flutter.js',
        'flutter_bootstrap.js',
        'icons/Icon-192.png',
        'index.html',
        'main.dart.js',
        'manifest.json',
        'sqlite3mc-3.5.1.wasm',
        'zxing/3.1.1/reader.js',
        'zxing/3.1.1/zxing_reader.wasm',
      ]);
    });

    test('records the SHA-256 and size of each file', () {
      write('index.html', 'abc');
      final index = collectPrecacheEntries(
        web,
      ).firstWhere((e) => e.url == 'index.html');
      expect(
        index.sha256,
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
      expect(index.size, 3);
    });

    test(
      'the generated files are never listed (so regenerating is stable)',
      () {
        final first = generate(webDir: web, template: _template);
        expect(File('${web.path}/sw.js').existsSync(), isTrue);
        expect(File('${web.path}/precache-manifest.json').existsSync(), isTrue);
        final second = generate(webDir: web, template: _template);
        expect(second, first);
        final manifest =
            jsonDecode(
                  File('${web.path}/precache-manifest.json').readAsStringSync(),
                )
                as Map<String, Object?>;
        final urls = [
          for (final f in manifest['files']! as List<Object?>)
            (f! as Map<String, Object?>)['url'],
        ];
        expect(urls, isNot(contains('sw.js')));
        expect(urls, isNot(contains('precache-manifest.json')));
      },
    );

    test('a bundle that cannot boot is refused', () {
      File('${web.path}/main.dart.js').deleteSync();
      expect(
        () => generate(webDir: web, template: _template),
        throwsA(isA<StateError>()),
      );
      expect(File('${web.path}/sw.js').existsSync(), isFalse);
    });
  });

  group('build id', () {
    test('is deterministic and changes when any file changes', () {
      final a = computeBuildId(collectPrecacheEntries(web));
      expect(computeBuildId(collectPrecacheEntries(web)), a);
      write('main.dart.js', 'new code');
      final b = computeBuildId(collectPrecacheEntries(web));
      expect(b, isNot(a));
      write('assets/new.png', 'asset');
      expect(computeBuildId(collectPrecacheEntries(web)), isNot(b));
    });

    test('is baked into sw.js and equals the manifest build id', () {
      final id = generate(webDir: web, template: _template);
      final manifest =
          jsonDecode(
                File('${web.path}/precache-manifest.json').readAsStringSync(),
              )
              as Map<String, Object?>;
      expect(manifest['buildId'], id);
      expect(
        File('${web.path}/sw.js').readAsStringSync(),
        contains("const BUILD_ID = '$id';"),
      );
    });

    test(
      'sw.js bytes change when the bundle changes (that is the update trigger)',
      () {
        generate(webDir: web, template: _template);
        final before = File('${web.path}/sw.js').readAsStringSync();
        write('main.dart.js', 'a different build');
        generate(webDir: web, template: _template);
        expect(File('${web.path}/sw.js').readAsStringSync(), isNot(before));
      },
    );

    test('an explicit id forces a new version; unsafe ids are refused', () {
      expect(
        generate(webDir: web, template: _template, buildIdOverride: 'test-2'),
        'test-2',
      );
      expect(
        File('${web.path}/sw.js').readAsStringSync(),
        contains("const BUILD_ID = 'test-2';"),
      );
      for (final bad in ["';alert(1)//", '../x', '', 'a b', 'x' * 65]) {
        expect(
          () => renderServiceWorker(_template, bad),
          throwsA(isA<ArgumentError>()),
          reason: bad,
        );
      }
    });
  });

  group('the real service worker template', () {
    late String sw;
    setUpAll(() {
      sw = File(
        '${repoRoot().path}/tools/pwa/sw.template.js',
      ).readAsStringSync();
    });

    /// The source without comment lines, so prose cannot satisfy a check.
    String code() => sw
        .split('\n')
        .where(
          (l) =>
              !l.trimLeft().startsWith('*') && !l.trimLeft().startsWith('/*'),
        )
        .join('\n');

    test('has exactly one build-id marker and renders', () {
      expect('__AI_NUTRITION_COACH_BUILD_ID__'.allMatches(sw), hasLength(1));
      expect(renderServiceWorker(sw, 'abc123'), contains("'abc123'"));
    });

    test('never intercepts cross-origin or non-GET requests', () {
      final c = code();
      expect(c, contains("request.method !== 'GET'"));
      expect(c, contains('url.origin !== self.location.origin'));
    });

    test(
      'waits for the user: skipWaiting only on the SKIP_WAITING message',
      () {
        final c = code();
        expect('skipWaiting()'.allMatches(c), hasLength(1));
        final handler = c.substring(c.indexOf("addEventListener('message'"));
        expect(
          handler.substring(0, handler.indexOf('});')),
          allOf(contains("'SKIP_WAITING'"), contains('skipWaiting()')),
        );
      },
    );

    test('caches only at install (precache), never at run time', () {
      final c = code();
      final fetchHandler = c.substring(c.indexOf("addEventListener('fetch'"));
      expect(fetchHandler, isNot(contains('.put(')));
      expect(fetchHandler, isNot(contains('.add(')));
      expect(c, contains('cache.put('));
    });

    test(
      'verifies every file it precaches and deletes old caches on activate',
      () {
        final c = code();
        expect(c, contains("crypto.subtle.digest('SHA-256'"));
        expect(c, contains('checksum mismatch'));
        expect(c, contains('caches.delete'));
        expect(c, contains('clients.claim()'));
      },
    );

    test(
      'keeps the network response headers (CSP etc.) on what it stores, minus '
      'wire-encoding headers and cookies',
      () {
        final c = code();
        final drop = RegExp(
          r"DROPPED_HEADERS = new Set\(\[([^\]]*)\]\)",
        ).firstMatch(c)!.group(1)!;
        expect(
          RegExp(r"'([^']+)'").allMatches(drop).map((m) => m.group(1)).toSet(),
          {
            'content-encoding',
            'content-length',
            'transfer-encoding',
            'set-cookie',
          },
        );
        expect(c, contains('response.headers.forEach'));
        expect(c, contains('DROPPED_HEADERS.has(name.toLowerCase())'));
        expect(c, contains('new Response(body, { status: 200, headers })'));
        expect(c, contains('headers.set(HASH_HEADER, file.sha256)'));
        expect(c, isNot(contains("'content-type'")));
      },
    );

    test('the document is never reused from an older cache (its headers can '
        'change with a deployment)', () {
      expect(code(), contains("file.url === 'index.html' ? null"));
    });

    test('contains no absolute URL (no third-party host can be reached)', () {
      expect(code(), isNot(contains('http://')));
      expect(code(), isNot(contains('https://')));
    });
  });

  group('rendered at container start (30-render-sw.sh)', () {
    late Directory work;
    setUp(() {
      work = Directory.systemTemp.createTempSync('ai_nutrition_coach_render_');
      Directory('${work.path}/html').createSync();
      File('${work.path}/html/sw.js').writeAsStringSync(
        "'use strict';\nconst BUILD_ID = 'abc123';\nrest();\n",
      );
      File(
        '${work.path}/html/precache-manifest.json',
      ).writeAsStringSync('{\n  "buildId": "abc123",\n  "files": []\n}\n');
      File('${work.path}/headers.inc').writeAsStringSync("add_header X 'a';\n");
    });
    tearDown(() => work.deleteSync(recursive: true));

    String id() {
      final m = RegExp(
        r"const BUILD_ID = '([^']+)';",
      ).firstMatch(File('${work.path}/out/sw.js').readAsStringSync())!;
      return m.group(1)!;
    }

    test(
      'the id is the bundle id plus a hash of the headers, in sw.js AND the manifest',
      () async {
        final r = await _render(work);
        expect(r.exitCode, 0, reason: '${r.stderr}');
        expect(id(), matches(RegExp(r'^abc123-[0-9a-f]{12}$')));
        expect(
          File('${work.path}/out/precache-manifest.json').readAsStringSync(),
          contains('"buildId": "${id()}"'),
        );
        expect(
          File('${work.path}/out/sw.js').readAsStringSync(),
          contains('rest();'),
        );
      },
    );

    test(
      'a changed Content-Security-Policy is a new service-worker version',
      () async {
        await _render(work);
        final before = id();
        await _render(work);
        expect(id(), before, reason: 'deterministic');
        File(
          '${work.path}/headers.inc',
        ).writeAsStringSync("add_header X 'a https://api.example.com';\n");
        await _render(work);
        expect(id(), isNot(before));
        expect(id(), startsWith('abc123-'));
      },
    );

    test('refuses to start on a bundle without a service worker', () async {
      File('${work.path}/html/sw.js').deleteSync();
      final r = await _render(work);
      expect(r.exitCode, isNot(0));
    });

    test(
      'AI_NUTRITION_COACH_SW_KILL=1 serves the kill-switch worker and an empty manifest',
      () async {
        final r = await _render(work, env: {'AI_NUTRITION_COACH_SW_KILL': '1'});
        expect(r.exitCode, 0, reason: '${r.stderr}');
        expect(
          File('${work.path}/out/sw.js').readAsStringSync(),
          File('${repoRoot().path}/tools/pwa/sw.kill.js').readAsStringSync(),
        );
        expect(
          File('${work.path}/out/precache-manifest.json').readAsStringSync(),
          contains('"files": []'),
        );
      },
    );
  });

  group('kill switch (tools/pwa/sw.kill.js)', () {
    late String kill;
    setUpAll(() {
      kill = File('${repoRoot().path}/tools/pwa/sw.kill.js')
          .readAsLinesSync()
          .where(
            (l) =>
                !l.trimLeft().startsWith('*') && !l.trimLeft().startsWith('/*'),
          )
          .join('\n');
    });

    test('takes over at once, deletes every cache, reloads open windows', () {
      expect(kill, contains("addEventListener('install'"));
      expect(kill, contains('self.skipWaiting()'));
      expect(kill, contains("addEventListener('activate'"));
      expect(kill, contains('caches.delete(name)'));
      expect(kill, contains('self.clients.claim()'));
      expect(kill, contains('client.navigate(client.url)'));
    });

    test(
      'is inert otherwise: no fetch handler, no registration.unregister (that loops)',
      () {
        expect(kill, isNot(contains("'fetch'")));
        expect(kill, isNot(contains('unregister')));
        expect(kill, isNot(contains('http')));
      },
    );

    test('the image ships it and nginx serves the rendered worker, no-cache', () {
      final docker = File(
        '${repoRoot().path}/infra/Dockerfile',
      ).readAsStringSync();
      expect(
        docker,
        contains('tools/pwa/sw.kill.js /etc/ai-nutrition-coach/sw.kill.js'),
      );
      expect(docker, contains('30-render-sw.sh'));
      final conf = File(
        '${repoRoot().path}/infra/nginx/templates/ai-nutrition-coach.conf.template',
      ).readAsStringSync();
      expect(conf, contains('location = /sw.js {'));
      expect(conf, contains('alias /tmp/ai-nutrition-coach-pwa/sw.js;'));
      expect(
        conf,
        contains('alias /tmp/ai-nutrition-coach-pwa/precache-manifest.json;'),
      );
    });
  });

  group('bootstrap (flutter_bootstrap.js)', () {
    late String bootstrap;
    setUpAll(() {
      bootstrap = File(
        '${repoRoot().path}/apps/client/web/flutter_bootstrap.js',
      ).readAsStringSync();
    });

    test(
      'repairs malformed navigator.languages before the engine parses them',
      () {
        expect(bootstrap, contains('new Intl.Locale(tag)'));
        expect(bootstrap, contains("split('@')[0]"));
        expect(bootstrap, contains("fixed = ['en']"));
        expect(
          bootstrap.indexOf('new Intl.Locale(tag)'),
          lessThan(bootstrap.indexOf('_flutter.loader.load')),
        );
      },
    );

    test(
      'has a one-shot recovery: a waiting worker is activated if nothing painted',
      () {
        expect(bootstrap, contains("document.querySelector('flt-glass-pane')"));
        expect(
          bootstrap,
          contains("sessionStorage.getItem('ai_nutrition_coach.recovery')"),
        );
        expect(bootstrap, contains("type: 'SKIP_WAITING'"));
      },
    );
  });
}

// ── the container-start rendering (infra/nginx/docker-entrypoint.d/30-render-sw.sh)
// and the kill switch ───────────────────────────────────────────────────────

Future<ProcessResult> _render(
  Directory work, {
  Map<String, String> env = const {},
}) => Process.run(
  'sh',
  ['${repoRoot().path}/infra/nginx/docker-entrypoint.d/30-render-sw.sh'],
  environment: {
    'PATH': Platform.environment['PATH'] ?? '/usr/bin:/bin',
    'AI_NUTRITION_COACH_PWA_SRC': '${work.path}/html',
    'AI_NUTRITION_COACH_PWA_OUT': '${work.path}/out',
    'AI_NUTRITION_COACH_HEADERS_FILE': '${work.path}/headers.inc',
    'AI_NUTRITION_COACH_SW_KILL_FILE':
        '${repoRoot().path}/tools/pwa/sw.kill.js',
    ...env,
  },
  includeParentEnvironment: false,
);

const String _template =
    "const BUILD_ID = '__AI_NUTRITION_COACH_BUILD_ID__';\n";
