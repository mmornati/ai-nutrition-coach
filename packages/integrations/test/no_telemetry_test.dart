// FR-12 / FR-9 / NFR4 — no-telemetry invariant test
// (Story 4.5).
//
// Pins the no-telemetry-by-default invariant three ways:
//   1. Import-based static check (N6): only the allow-listed adapter
//      files (OFF barcode source, BYOK provider, their capped-response
//      helper) import a network transport; no telemetry SDK anywhere.
//   2. Source-tree check: the production `main.dart` imports no
//      transport at all.
//   3. Doc-claim check: the user-facing copy in `docs/ai-tiers.md`
//      and `docs/self-host.md` matches the actual code paths — no
//      overclaim.
//
// The test is a Dart unit test; no `dart test`/`flutter analyze`
// outside this repo. The check script (`tools/check_telemetry_claims.dart`)
// duplicates the assertions for the `melos run check:telemetry`
// script and the release-gate CI job.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../../../tools/telemetry_scan.dart';

/// The repository root, found by walking up from the package directory
/// `flutter test` runs in until the `tools/` check scripts appear. The
/// invariant spans every package + the app, so it cannot assume a cwd.
final Directory _root = () {
  var dir = Directory.current.absolute;
  while (!File('${dir.path}/tools/check_telemetry_claims.dart').existsSync()) {
    final parent = dir.parent;
    if (parent.path == dir.path) {
      throw StateError('repository root not found from ${Directory.current}');
    }
    dir = parent;
  }
  return dir;
}();

File _file(String relative) => File('${_root.path}/$relative');

void main() {
  group('no-telemetry invariant (Story 4.5 / FR-12 / FR-9 / NFR4)', () {
    test('only allow-listed adapters use a network transport (N6)', () {
      // AST-based (tools/telemetry_scan.dart): conditional imports, exports and
      // part files included. Independent of call-site spellings.
      final violations = scanRepo(_root).map((f) => '$f').toList();
      expect(
        violations,
        isEmpty,
        reason: 'Only allow-listed adapters may use a transport: $violations',
      );
      for (final adapter in networkAdapterAllowList) {
        expect(_file(adapter).existsSync(), isTrue, reason: 'stale: $adapter');
      }
    });

    test('production main.dart imports no network transport', () {
      final findings = scanSource(
        'apps/client/lib/main.dart',
        _file('apps/client/lib/main.dart').readAsStringSync(),
        allowListed: false,
      );
      expect(findings, isEmpty, reason: '$findings');
    });

    group('scanner (synthetic sources)', () {
      List<Finding> scan(String src, {bool allow = false}) =>
          scanSource('x/lib/a.dart', src, allowListed: allow);

      test('flags networking packages, even without call-site strings', () {
        expect(
          scan("import 'package:dio/dio.dart';\nfinal c = Dio();"),
          hasLength(1),
        );
        expect(scan("import 'package:http/http.dart' as h;"), hasLength(1));
        expect(
          scan("export 'package:web_socket_channel/io.dart';"),
          hasLength(1),
        );
      });

      test('allow-listed adapters may import a transport', () {
        expect(scan("import 'package:dio/dio.dart';", allow: true), isEmpty);
      });

      test('telemetry SDKs are flagged even in allow-listed files', () {
        expect(
          scan(
            "import 'package:sentry_flutter/sentry_flutter.dart';",
            allow: true,
          ),
          hasLength(1),
        );
      });

      test('dart:io is fine for files, flagged with socket classes', () {
        expect(
          scan("import 'dart:io';\nvoid f() => File('a').exists();"),
          isEmpty,
        );
        expect(
          scan("import 'dart:io';\nfinal c = HttpClient();"),
          hasLength(1),
        );
        expect(
          scan("import 'dart:io';\nfinal s = WebSocket.connect('x');"),
          hasLength(1),
        );
      });

      test('package:web is fine for storage, flagged for fetch / XHR', () {
        expect(
          scan(
            "import 'package:web/web.dart' as web;\nvar x = web.window.localStorage;",
          ),
          isEmpty,
        );
        expect(
          scan(
            "import 'package:web/web.dart' as web;\nvoid f() => web.window.fetch('x'.toJS);",
          ),
          hasLength(1),
        );
        expect(
          scan("import 'dart:js_interop';\nvoid f() => XMLHttpRequest();"),
          hasLength(1),
        );
      });

      test('bypass: conditional import branch naming a transport', () {
        final f = scan(
          "import 'stub.dart' if (dart.library.io) 'package:dio/dio.dart';",
        );
        expect(f, hasLength(1));
        expect(f.single.message, contains('package:dio/dio.dart'));
        expect(
          scan(
            "import 'a.dart' if (dart.library.js_interop) 'package:sentry/sentry.dart';",
            allow: true,
          ),
          hasLength(1),
        );
      });

      test('bypass: barrel re-exporting dart:io / dio / package:web', () {
        expect(scan("export 'dart:io';"), hasLength(1));
        expect(scan("export 'package:dio/dio.dart' show Dio;"), hasLength(1));
        expect(scan("export 'package:web/web.dart';"), hasLength(1));
        expect(
          scan("export 'x.dart' if (dart.library.io) 'dart:io';"),
          hasLength(1),
        );
        // ...but the allow-list may.
        expect(scan("export 'package:dio/dio.dart';", allow: true), isEmpty);
      });

      test(
        'bypass: socket use in a `part` file is merged with its library',
        () {
          final f = scanSource(
            'x/lib/lib.dart',
            "import 'dart:io';\npart 'lib_part.dart';",
            allowListed: false,
            partSources: {
              'x/lib/lib_part.dart':
                  "part of 'lib.dart';\nfinal c = HttpClient();",
            },
          );
          expect(f, hasLength(1));
          expect(f.single.path, 'x/lib/lib_part.dart');
        },
      );

      test('bypass: Image.network / NetworkImage without any import', () {
        expect(scan("void f() => Image.network('https://x');"), hasLength(1));
        expect(scan("final i = NetworkImage('https://x');"), hasLength(1));
        expect(scan("final w = Image.network('u');", allow: true), isEmpty);
        expect(scan("void f() => Image.memory(bytes);"), isEmpty);
      });

      test('bypass: telemetry SDKs matched by prefix', () {
        for (final pkg in [
          'firebase_remote_config',
          'sentry_logging',
          'sentry_dio',
          'mixpanel_flutter',
          'posthog_flutter',
        ]) {
          expect(
            scan("import 'package:$pkg/$pkg.dart';", allow: true),
            hasLength(1),
            reason: pkg,
          );
        }
        expect(
          scanPubspec(
            'apps/client/pubspec.yaml',
            'dependencies:\n  firebase_messaging: ^1.0.0\n',
          ),
          hasLength(1),
        );
      });

      test('strings and comments mentioning an API do not count', () {
        expect(
          scan(
            "import 'dart:io';\nconst s = 'HttpClient Image.network';\n// Socket",
          ),
          isEmpty,
        );
      });

      test('legacy dart:html is flagged', () {
        expect(scan("import 'dart:html';"), hasLength(1));
      });

      test('comments and doc text do not count', () {
        expect(
          scan(
            "// import 'package:dio/dio.dart';\n/// uses HttpClient and fetch(\nvoid f() {}",
          ),
          isEmpty,
        );
      });

      test('pubspec: network deps only in packages/integrations', () {
        const spec =
            'name: a\ndependencies:\n  flutter:\n    sdk: flutter\n  dio: ^5.0.0\n';
        expect(scanPubspec('apps/client/pubspec.yaml', spec), hasLength(1));
        expect(
          scanPubspec('packages/integrations/pubspec.yaml', spec),
          isEmpty,
        );
        expect(
          scanPubspec(
            'packages/integrations/pubspec.yaml',
            'dependencies:\n  sentry: ^8.0.0\n',
          ),
          hasLength(1),
        );
      });
    });

    test(
      'docs/ai-tiers.md + docs/self-host.md no-telemetry copy is anchored',
      () {
        final aiTiers = _file('docs/ai-tiers.md').readAsStringSync();
        final selfHost = _file('docs/self-host.md').readAsStringSync();
        // Both files must assert "no telemetry by default" — Story 4.5
        // ships this anchor copy and the test pins it.
        expect(
          aiTiers.toLowerCase().contains('no telemetry'),
          isTrue,
          reason: 'docs/ai-tiers.md must anchor the FR-12 claim',
        );
        expect(
          selfHost.toLowerCase().contains('no telemetry'),
          isTrue,
          reason: 'docs/self-host.md must anchor the FR-12 claim',
        );
      },
    );

    test('Tip Jar is Settings-only, never in a task flow (FR-15 / UX-DR9)', () {
      // The Day Board, capture sheet, and coach whisper widgets must
      // not render a Tip Jar affordance. The Settings sub-screen
      // (Story 4.1/4.2 / apps/client/lib/screens/) is the only
      // surface where a Tip Jar copy is allowed.
      final surfaces = [
        'apps/client/lib/screens/day_board_screen.dart',
        'apps/client/lib/screens/capture_photo_screen.dart',
        'apps/client/lib/screens/capture_barcode_screen.dart',
        'apps/client/lib/screens/manual_entry_screen.dart',
        'apps/client/lib/widgets/coach_whisper.dart',
        'apps/client/lib/widgets/capture_sheet.dart',
        'apps/client/lib/widgets/capture_fab.dart',
      ];
      for (final path in surfaces) {
        // Comments may legitimately say "no Tip Jar" — only code counts.
        final content = _file(path)
            .readAsLinesSync()
            .where((l) => !l.trimLeft().startsWith('//'))
            .join('\n');
        expect(
          content.toLowerCase().contains('tip jar'),
          isFalse,
          reason: 'Tip Jar must never render in $path (FR-15 / UX-DR9)',
        );
      }
    });
  });
}
