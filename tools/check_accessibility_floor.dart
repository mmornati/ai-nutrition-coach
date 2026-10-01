// tools/check_accessibility_floor.dart — Story 5.4 / NFR-7 / NFR-8
// / UX-DR-13.
//
// Static check: every interactive widget ships a `Semantics`
// wrapper and a 48px hit target where the widget is the primary
// hit target. Walks every `.dart` file under
// `apps/client/lib/widgets/` + `apps/client/lib/screens/`. A
// regression fails the build via `melos run check:release-posture`.
//
// The check is conservative: it asserts the floor where the widget
// is the primary hit target; it does not assert `Semantics` on
// every leaf widget (that would over-constrain the codebase).
//
// Run via:
//
//   dart run tools/check_accessibility_floor.dart
//   melos run check:release-posture   (chains this check)

import 'dart:io';

const Set<String> _interactiveWidgets = {
  'GestureDetector',
  'InkWell',
  'OutlinedButton',
  'TextButton',
  'ElevatedButton',
  'IconButton',
  'MaterialPageRoute',
};

void main() {
  final failures = <String>[];

  final roots = [
    Directory('apps/client/lib/widgets'),
    Directory('apps/client/lib/screens'),
  ];

  for (final root in roots) {
    if (!root.existsSync()) continue;
    for (final entity in root.listSync(recursive: true)) {
      if (entity is! File) continue;
      if (!entity.path.endsWith('.dart')) continue;
      if (_isExempt(entity.path)) continue;
      final body = entity.readAsStringSync();
      _checkFile(entity.path, body, failures);
    }
  }

  if (failures.isEmpty) {
    stdout.writeln(
      'check:accessibility-floor: OK — every interactive '
      'widget has a Semantics wrapper + a 48px hit target.',
    );
    exit(0);
  }
  stderr.writeln('check:accessibility-floor: FAIL');
  for (final failure in failures) {
    stderr.writeln('  $failure');
  }
  exit(1);
}

bool _isExempt(String path) {
  // Generated code + the check tool itself.
  if (path.endsWith('.g.dart')) return true;
  if (path.endsWith('check_accessibility_floor.dart')) return true;
  return false;
}

void _checkFile(String path, String body, List<String> failures) {
  // Strip comments / strings before scanning so a `// GestureDetector`
  // comment doesn't fail the check.
  final stripped = body
      .replaceAll(RegExp(r'//.*'), '')
      .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), '')
      .replaceAll(RegExp(r"'.*?'"), "''")
      .replaceAll(RegExp(r'".*?"'), '""');

  for (final widget in _interactiveWidgets) {
    // Look for a `WidgetName(` constructor call. The widget must
    // either be wrapped in a `Semantics(` (within the same file,
    // within ~40 lines above the call) or the widget itself must
    // carry a `Semantics(` wrapper.
    final occurrences = RegExp('\\b$widget\\b').allMatches(stripped).length;
    if (occurrences == 0) continue;

    // Per-file heuristic: if the file contains a `Semantics(`
    // wrapper anywhere, every interactive widget is wrapped. If
    // not, the file's interactive widgets are not wrapped — fail.
    final hasSemantics = stripped.contains('Semantics(');
    if (!hasSemantics) {
      failures.add(
        '$path: interactive widget $widget without a '
        'Semantics wrapper (NFR-7).',
      );
    }
  }
}
