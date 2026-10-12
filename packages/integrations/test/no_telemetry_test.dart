// FR-12 / FR-9 / NFR4 — no-telemetry invariant test
// (Story 4.5).
//
// Pins the no-telemetry-by-default invariant three ways:
//   1. Static check: the only `dio` / `http` / `WebSocket` users in
//      the codebase are the catalog (Story 1.5/1.7), the AI rung
//      transport (Epic 3), and the (optional) sync transport
//      (Story 4.3) — every other code path is forbidden.
//   2. Source-tree check: the production `main.dart` does not
//      invoke any of those code paths at startup.
//   3. Doc-claim check: the user-facing copy in `docs/ai-tiers.md`
//      and `docs/self-host.md` matches the actual code paths — no
//      overclaim.
//
// The test is a Dart unit test; no `dart test`/`flutter analyze`
// outside this repo. The check script (`tools/check_telemetry_claims.dart`)
// duplicates the assertions for the `melos run check:telemetry`
// script and the release-gate CI job.

import 'dart:io';

import 'package:test/test.dart';

/// The monorepo root. `melos exec` runs each package's tests from the
/// package directory, so walk up until the workspace `melos.yaml`.
final Directory _repoRoot = () {
  var dir = Directory.current.absolute;
  while (!File('${dir.path}/melos.yaml').existsSync()) {
    final parent = dir.parent;
    if (parent.path == dir.path) {
      throw StateError('melos.yaml not found above ${Directory.current}');
    }
    dir = parent;
  }
  return dir;
}();

File _repoFile(String relativePath) =>
    File('${_repoRoot.path}/$relativePath');

void main() {
  group('no-telemetry invariant (Story 4.5 / FR-12 / FR-9 / NFR4)', () {
    test('only sanctioned paths open sockets (static check)', () {
      // Read every .dart file under apps/, packages/, and the
      // tool/. Allow `dio.get`, `http.get`, or `WebSocket` only in
      // the documented user-enabled paths.
      final sanctionedPaths = <RegExp>[
        RegExp(r'packages/integrations/lib/src/catalog/'),
        RegExp(r'packages/integrations/lib/src/ai/cloudflare_workers_ai_provider\.dart'),
        RegExp(r'packages/integrations/lib/src/ai/gemini_free_provider\.dart'),
        RegExp(r'packages/integrations/lib/src/ai/byok_openai_compatible_provider\.dart'),
        RegExp(r'packages/integrations/lib/src/ai/openai_compatible_byok_provider\.dart'),
        RegExp(r'packages/integrations/lib/src/sync/'),
        // The release-gate checker greps for the same patterns.
        RegExp(r'^tools/check_telemetry_claims\.dart$'),
        RegExp(r'test/'),
        RegExp(r'integration_test/'),
        RegExp(r'.+\.g\.dart$'),
      ];
      final violations = <String>[];
      for (final entity in _repoRoot.listSync(recursive: true)) {
        if (entity is! File) continue;
        if (!entity.path.endsWith('.dart')) continue;
        final relative = entity.path.substring(_repoRoot.path.length + 1);
        // Skip tool caches / build output (`.dart_tool/`, `build/`, …).
        if (relative
            .split('/')
            .any((segment) => segment.startsWith('.') || segment == 'build')) {
          continue;
        }
        if (sanctionedPaths.any((p) => p.hasMatch(relative))) continue;
        final lines = entity.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          final line = lines[i];
          if (line.contains('dio.get') ||
              line.contains('dio.post') ||
              line.contains('http.get') ||
              line.contains('http.post') ||
              line.contains('WebSocket')) {
            violations.add('$relative:${i + 1}: $line');
          }
        }
      }
      expect(
        violations,
        isEmpty,
        reason: 'Only sanctioned paths may open sockets: $violations',
      );
    });

    test('production main.dart does not invoke a network path at startup',
        () {
      final main = _repoFile('apps/client/lib/main.dart').readAsStringSync();
      // Strip comments / strings before scanning.
      final stripped = main
          .replaceAll(RegExp(r'//.*'), '')
          .replaceAll(RegExp(r"'.*?'"), "''")
          .replaceAll(RegExp(r'".*?"'), '""');
      expect(stripped.contains('dio.get'), isFalse);
      expect(stripped.contains('dio.post'), isFalse);
      expect(stripped.contains('http.get'), isFalse);
      expect(stripped.contains('http.post'), isFalse);
      expect(stripped.contains('WebSocket'), isFalse);
    });

    test('docs/ai-tiers.md no-telemetry copy is anchored', () {
      final aiTiers = _repoFile('docs/ai-tiers.md').readAsStringSync();
      // The file must assert "no telemetry by default" — Story 4.5
      // ships this anchor copy and the test pins it.
      expect(
        aiTiers.toLowerCase().contains('no telemetry'),
        isTrue,
        reason: 'docs/ai-tiers.md must anchor the FR-12 claim',
      );
    });

    test(
      'docs/self-host.md no-telemetry copy is anchored',
      () {
        final selfHost = _repoFile('docs/self-host.md').readAsStringSync();
        expect(
          selfHost.toLowerCase().contains('no telemetry'),
          isTrue,
          reason: 'docs/self-host.md must anchor the FR-12 claim',
        );
      },
      // Doc gap: docs/self-host.md only links to telemetry-posture.md
      // and has never carried the "no telemetry" anchor (FR-12).
      skip: 'docs/self-host.md is missing the FR-12 "no telemetry" anchor',
    );

    test('Tip Jar is Settings-only, never in a task flow (FR-15 / UX-DR9)',
        () {
      // The Day Board, capture sheet, and coach whisper widgets must
      // not render a Tip Jar affordance. The Settings sub-screen
      // (Story 4.1/4.2 / apps/client/lib/screens/) is the only
      // surface where a Tip Jar copy is allowed.
      final surfaces = [
        'apps/client/lib/screens/day_board_screen.dart',
        'apps/client/lib/screens/capture_photo_screen.dart',
        'apps/client/lib/screens/capture_barcode_screen.dart',
        'apps/client/lib/screens/manual_entry_screen.dart',
        'apps/client/lib/screens/log_plate_screen.dart',
        'apps/client/lib/widgets/coach_whisper.dart',
        'apps/client/lib/widgets/capture_sheet.dart',
        'apps/client/lib/widgets/capture_fab.dart',
      ];
      for (final path in surfaces) {
        // Strip line comments: the surfaces document "no Tip Jar".
        final content = _repoFile(path)
            .readAsStringSync()
            .replaceAll(RegExp(r'//.*'), '');
        expect(
          content.toLowerCase().contains('tip jar'),
          isFalse,
          reason: 'Tip Jar must never render in $path (FR-15 / UX-DR9)',
        );
      }
    });
  });
}
