// Story 4.6 — release-posture check script.
//
// Asserts that the three artifacts the FR-12 invariant requires
// are at HEAD:
//
//   1. `LICENSE` (MIT)
//   2. `CONTRIBUTING.md`
//   3. `docs/no-dark-patterns-standard.md`
//
// Plus: the banned-everywhere list in the NDP standard is
// unchanged from the documented baseline, and EVERY row of the README
// "Trust posture" table has a `Proof` cell naming test files that exist and
// contain at least one test (Phase 7: a promise with no test is a claim, not
// a guarantee). A regression on any of these fails the build.
//
// Run via:
//
//   dart run tools/check_release_posture.dart
//   melos run check:release-posture

import 'dart:io';

import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';

const Set<String> _requiredArtifacts = {
  'LICENSE',
  'CONTRIBUTING.md',
  'docs/no-dark-patterns-standard.md',
  'docs/release-checklist.md',
};

const Set<String> _bannedEverywhereBaseline = {
  'streaks',
  'countdowns',
  'badges',
  'celebratory pop-ups',
  'push-notification re-engagement',
  'card sprawl',
  'red-guilt',
  'resolve spinners',
};

/// `true` if [source] makes at least one real, un-skipped call to `test`,
/// `testWidgets` or `a11yTest` (read from the AST: a comment, a string or a
/// `skip:`ped test does not count).
bool hasRealTest(String source) {
  final unit = parseString(content: source, throwIfDiagnostics: false).unit;
  final finder = _TestFinder();
  unit.accept(finder);
  return finder.found;
}

class _TestFinder extends RecursiveAstVisitor<void> {
  bool found = false;

  @override
  void visitMethodInvocation(MethodInvocation node) {
    if (node.target == null &&
        const {
          'test',
          'testWidgets',
          'a11yTest',
        }.contains(node.methodName.name)) {
      final skipped = node.argumentList.arguments
          .whereType<NamedArgument>()
          .any(
            (a) =>
                a.name.lexeme == 'skip' &&
                !(a.argumentExpression is BooleanLiteral &&
                    !(a.argumentExpression as BooleanLiteral).value),
          );
      if (!skipped) found = true;
    }
    super.visitMethodInvocation(node);
  }
}

/// Failures of the README trust-table proof rule for the repo at [root].
List<String> checkTrustTable(Directory root) {
  final failures = <String>[];
  final readme = File('${root.path}/README.md');
  if (!readme.existsSync()) return ['README.md is missing'];
  final lines = readme.readAsLinesSync();
  final start = lines.indexWhere((l) => l.trim() == '## Trust posture');
  if (start < 0) return ['README.md has no "## Trust posture" section'];

  // The first markdown table after the heading.
  final table = <String>[];
  for (var i = start + 1; i < lines.length; i++) {
    final line = lines[i].trim();
    if (line.startsWith('## ')) break;
    if (line.startsWith('|')) {
      table.add(line);
    } else if (table.isNotEmpty) {
      break;
    }
  }
  if (table.length < 3) {
    return ['README trust table not found or empty'];
  }
  List<String> cells(String row) => row
      .substring(1, row.length - (row.endsWith('|') ? 1 : 0))
      .split('|')
      .map((c) => c.trim())
      .toList();
  final header = cells(table.first);
  final proofCol = header.indexWhere((h) => h.toLowerCase() == 'proof');
  if (proofCol < 0) {
    return ['README trust table has no "Proof" column'];
  }
  for (final row in table.skip(2)) {
    final c = cells(row);
    final promise = c.isEmpty ? row : c.first;
    final label = promise.length > 60
        ? '${promise.substring(0, 57)}...'
        : promise;
    final proofCell = proofCol < c.length ? c[proofCol] : '';
    final paths = RegExp(
      r'`([^`]+)`',
    ).allMatches(proofCell).map((m) => m.group(1)!).toList();
    if (paths.isEmpty) {
      failures.add('trust row has no proof test: "$label"');
      continue;
    }
    for (final path in paths) {
      if (!path.endsWith('_test.dart')) {
        failures.add('proof "$path" is not a *_test.dart file ("$label")');
        continue;
      }
      final file = File('${root.path}/$path');
      if (!file.existsSync()) {
        failures.add('proof file does not exist: $path ("$label")');
      } else if (!hasRealTest(file.readAsStringSync())) {
        failures.add('proof file contains no test: $path ("$label")');
      }
    }
  }
  return failures;
}

void main() {
  final failures = <String>[];

  failures.addAll(checkTrustTable(Directory.current));

  // 1. Required artifacts at HEAD.
  for (final path in _requiredArtifacts) {
    if (!File(path).existsSync()) {
      failures.add('missing required artifact: $path');
    }
  }

  // 2. LICENSE is MIT.
  final license = File('LICENSE').existsSync()
      ? File('LICENSE').readAsStringSync()
      : '';
  if (!license.contains('MIT License')) {
    failures.add('LICENSE does not contain the MIT marker');
  }

  // 3. The NDP standard's banned-everywhere list is unchanged.
  final ndp = File('docs/no-dark-patterns-standard.md').existsSync()
      ? File(
          'docs/no-dark-patterns-standard.md',
        ).readAsStringSync().toLowerCase()
      : '';
  for (final banned in _bannedEverywhereBaseline) {
    if (!ndp.contains(banned)) {
      failures.add('NDP standard missing banned-everywhere term: "$banned"');
    }
  }

  // 4. CONTRIBUTING documents build / test / smoke commands.
  final contributing = File('CONTRIBUTING.md').existsSync()
      ? File('CONTRIBUTING.md').readAsStringSync()
      : '';
  for (final command in [
    'melos bootstrap',
    'melos run test',
    'melos run smoke:self-host',
  ]) {
    if (!contributing.contains(command)) {
      failures.add('CONTRIBUTING.md missing command: $command');
    }
  }

  if (failures.isEmpty) {
    stdout.writeln(
      'check:release-posture: OK — '
      'LICENSE, CONTRIBUTING, NDP standard at HEAD; every README trust row '
      'has a proof test.',
    );
    exit(0);
  }
  stderr.writeln('check:release-posture: FAIL');
  for (final failure in failures) {
    stderr.writeln('  $failure');
  }
  exit(1);
}
