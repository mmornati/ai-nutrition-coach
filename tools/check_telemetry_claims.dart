// Telemetry gate (Story 4.5, rewritten in Phase 4 / N6).
//
//   dart run tools/check_telemetry_claims.dart
//   melos run check:telemetry
//
// The FR-12 / FR-9 / NFR4 no-telemetry invariant, enforced from IMPORTS
// rather than call-site strings (see tools/telemetry_scan.dart):
//
//   1. No shipped Dart file under apps/ or packages/ (parsed with the
//      analyzer; conditional imports, exports and part files included) uses a
//      network transport (package:dio, package:http, dart:io sockets,
//      package:web fetch/XHR/WebSocket, Image.network, ...) unless it is in the
//      explicit adapter allow-list `networkAdapterAllowList`.
//   2. No telemetry / crash-reporting SDK (matched by prefix) is imported or
//      declared anywhere.
//   3. Network packages are only declared in packages/integrations/pubspec.yaml.
//   4. Every allow-listed adapter still exists (a stale list silently widens
//      the gate).
//   5. Every doc that claims "no telemetry" is anchored to this gate.
//
// Complemented by the built-bundle host scan (tools/check_no_external_hosts.sh)
// and the container egress test (scripts/smoke_self_host.sh).

import 'dart:io';

import 'telemetry_scan.dart';

void main() {
  final failures = <String>[];

  // 1 + 2 + 3. Source (AST) + pubspec findings, whole repo.
  failures.addAll(scanRepo(Directory.current).map((f) => '$f'));

  // 4. The allow-list must not point at files that no longer exist.
  for (final adapter in networkAdapterAllowList) {
    if (!File(adapter).existsSync()) {
      failures.add('allow-list entry does not exist: $adapter');
    }
  }

  // 5. Docs — every claim of "no telemetry" must be anchored to this gate.
  final docsDir = Directory('docs');
  if (docsDir.existsSync()) {
    for (final doc in docsDir.listSync(recursive: true)) {
      if (doc is! File || !doc.path.endsWith('.md')) continue;
      final body = doc.readAsStringSync().toLowerCase();
      if (body.contains('no telemetry') &&
          !body.contains('check_telemetry_claims') &&
          !body.contains('check:telemetry') &&
          doc.path != 'docs/telemetry-posture.md') {
        failures.add(
          '${doc.path}: "no telemetry" claim is not anchored to the gate',
        );
      }
    }
  }

  if (failures.isEmpty) {
    stdout.writeln(
      'check:telemetry: OK — only the ${networkAdapterAllowList.length} '
      'allow-listed adapters import a network transport; no telemetry SDKs; '
      'docs anchored.',
    );
    exit(0);
  }
  stderr.writeln('check:telemetry: FAIL');
  for (final failure in failures) {
    stderr.writeln('  $failure');
  }
  exit(1);
}
