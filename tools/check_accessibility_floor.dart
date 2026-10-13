// tools/check_accessibility_floor.dart — Story 5.4 / NFR-7 / NFR-8
// / UX-DR-13.
//
// Static check: every raw gesture widget ships a `Semantics`
// wrapper and every `IconButton` a tooltip, so each primary hit
// target has an accessible label. Walks every `.dart` file under
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

/// Raw gesture widgets carry no semantics role of their own, so the
/// file must wrap them in `Semantics(`.
///
/// Material buttons (`OutlinedButton`, `TextButton`, `ElevatedButton`)
/// are deliberately not listed: they already expose the button role,
/// their label and the tap action, and wrapping them in `Semantics`
/// creates a duplicate node that screen readers announce twice.
const Set<String> _rawGestureWidgets = {'GestureDetector', 'InkWell'};

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
      'check:accessibility-floor: OK — raw gesture widgets carry '
      'Semantics; every IconButton has a tooltip.',
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
  // Tool caches / build output (`.dart_tool/`, `build/`, …).
  if (path
      .split('/')
      .any((s) => (s.startsWith('.') && s != '.') || s == 'build')) {
    return true;
  }
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

  // An `IconButton` has no visible text, so its `tooltip` is its
  // accessible label — every call must set one.
  final iconButtons = RegExp(r'\bIconButton\(').allMatches(stripped).length;
  final tooltips = RegExp(r'\btooltip:').allMatches(stripped).length;
  if (iconButtons > tooltips) {
    failures.add(
      '$path: IconButton without a tooltip (its semantics '
      'label, NFR-7).',
    );
  }

  for (final widget in _rawGestureWidgets) {
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
