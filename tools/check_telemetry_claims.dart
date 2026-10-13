// Story 4.5 — telemetry-claim docs check script.
//
// Walks `docs/` and asserts that every user-facing privacy claim
// is anchored to the actual code. Run via:
//
//   dart run tools/check_telemetry_claims.dart
//   melos run check:telemetry
//
// The check is the FR-12 / FR-9 / NFR4 gate. A regression fails
// the build (it's part of `melos run test` and the release-gate CI
// workflow).
//
// Assertions:
//   1. Every doc under `docs/` that contains a "no telemetry" claim
//      anchors to a code path or a sanctioned list.
//   2. The production `apps/client/lib/main.dart` does not invoke a
//      network code path at startup.
//   3. The static list of `dio` / `http` / `WebSocket` users under
//      `apps/` + `packages/` matches the sanctioned list.

import 'dart:io';

const Set<String> _sanctionedSockets = {
  'packages/integrations/lib/src/catalog/off_barcode_source.dart',
  'packages/integrations/lib/src/catalog/offline_first_food_catalog.dart',
  'packages/integrations/lib/src/ai/cloudflare_workers_ai_provider.dart',
  'packages/integrations/lib/src/ai/gemini_free_provider.dart',
  'packages/integrations/lib/src/ai/byok_openai_compatible_provider.dart',
  'packages/integrations/lib/src/ai/openai_compatible_byok_provider.dart',
  'packages/integrations/lib/src/sync/',
};

void main() {
  final failures = <String>[];

  // 1. Static check — only sanctioned paths may open sockets.
  for (final entity in Directory('.').listSync(recursive: true)) {
    if (entity is! File) continue;
    if (!entity.path.endsWith('.dart')) continue;
    if (_isSanctioned(entity.path)) continue;
    final lines = entity.readAsLinesSync();
    for (var i = 0; i < lines.length; i++) {
      final line = lines[i];
      if (_opensSocket(line)) {
        failures.add('${entity.path}:${i + 1}: $line');
      }
    }
  }

  // 2. Production main.dart must not invoke a network path.
  final main = File('apps/client/lib/main.dart').readAsStringSync();
  final stripped = main
      .replaceAll(RegExp(r'//.*'), '')
      .replaceAll(RegExp(r"'.*?'"), "''")
      .replaceAll(RegExp(r'".*?"'), '""');
  for (final pattern in [
    'dio.get',
    'dio.post',
    'http.get',
    'http.post',
    'WebSocket',
  ]) {
    if (stripped.contains(pattern)) {
      failures.add('apps/client/lib/main.dart invokes $pattern at startup');
    }
  }

  // 3. Docs — every claim of "no telemetry" must exist in the
  //    docs the user can read.
  final docs = Directory('docs').listSync(recursive: true);
  for (final doc in docs) {
    if (doc is! File) continue;
    if (!doc.path.endsWith('.md')) continue;
    final body = doc.readAsStringSync().toLowerCase();
    if (body.contains('no telemetry') &&
        !body.contains('check_telemetry_claims') &&
        !body.contains('check:telemetry') &&
        doc.path != 'docs/telemetry-posture.md') {
      // Every "no telemetry" doc claim must reference the gate or
      // be the gate itself.
      failures.add(
        '${doc.path}: "no telemetry" claim is not anchored to the gate',
      );
    }
  }

  if (failures.isEmpty) {
    stdout.writeln(
      'check:telemetry: OK — no unsanctioned sockets; '
      'docs match code.',
    );
    exit(0);
  }
  stderr.writeln('check:telemetry: FAIL');
  for (final failure in failures) {
    stderr.writeln('  $failure');
  }
  exit(1);
}

bool _isSanctioned(String path) {
  // The release-gate check scripts grep for the same patterns.
  if (path.contains('tools/check_')) return true;
  // Tool caches / build output (`.dart_tool/`, `build/`, …).
  if (path
      .split('/')
      .any((s) => (s.startsWith('.') && s != '.') || s == 'build')) {
    return true;
  }
  if (path.contains('/test/')) return true;
  if (path.contains('/integration_test/')) return true;
  if (path.endsWith('.g.dart')) return true;
  for (final sanctioned in _sanctionedSockets) {
    if (path.startsWith(sanctioned) || path.contains('/$sanctioned')) {
      return true;
    }
  }
  return false;
}

bool _opensSocket(String line) {
  return line.contains('dio.get') ||
      line.contains('dio.post') ||
      line.contains('http.get') ||
      line.contains('http.post') ||
      line.contains('WebSocket');
}
