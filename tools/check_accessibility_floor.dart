// tools/check_accessibility_floor.dart — Story 5.4 / NFR-7 / NFR-8 /
// UX-DR-13 (rewritten in the security review, Phase 7).
//
// The old check grepped for the text `Semantics(` in a file, which passed on
// any file that merely contained the word and measured nothing. This check
// instead enforces that accessibility is MEASURED by widget tests:
//
//   1. `apps/client/test/a11y/a11y_helpers.dart` must assert all four
//      Flutter guidelines through `meetsGuideline(...)`:
//      androidTapTargetGuideline, iOSTapTargetGuideline,
//      labeledTapTargetGuideline and textContrastGuideline.
//   2. EVERY public widget class declared in a screen file under
//      `apps/client/lib/screens/` (except the non-UI allow-list below) must be
//      constructed inside a `test` / `testWidgets` / `a11yTest` body under
//      `apps/client/test/a11y/` that also calls `expectMeetsAllGuidelines`.
//      Read from the AST: a comment or string naming a screen does not count.
//
// The tests themselves run in `melos run test`; this tool makes sure a new
// screen cannot ship without one. Run via:
//
//   dart run tools/check_accessibility_floor.dart
//   melos run check:release-posture   (chains this check)

import 'dart:io';

import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';

/// Screen-folder files that are not screens (no widget tree to measure).
const Set<String> _nonScreenFiles = {'capture_targets.dart'};

const List<String> _requiredGuidelines = [
  'androidTapTargetGuideline',
  'iOSTapTargetGuideline',
  'labeledTapTargetGuideline',
  'textContrastGuideline',
];

void main() {
  final failures = check(root: Directory.current);
  if (failures.isEmpty) {
    stdout.writeln(
      'check:accessibility-floor: OK — every screen is covered by a '
      'tap-target / label / contrast guideline widget test.',
    );
    exit(0);
  }
  stderr.writeln('check:accessibility-floor: FAIL');
  for (final failure in failures) {
    stderr.writeln('  $failure');
  }
  exit(1);
}

/// Returns the failures for the repository at [root] (empty = OK).
///
/// Everything is read from the parsed AST, so comments and strings that merely
/// mention a guideline or a screen never count.
List<String> check({required Directory root}) {
  final failures = <String>[];
  final a11yDir = Directory('${root.path}/apps/client/test/a11y');
  final helpers = File('${a11yDir.path}/a11y_helpers.dart');

  if (!helpers.existsSync()) {
    failures.add('missing apps/client/test/a11y/a11y_helpers.dart');
  } else {
    final unit = parseString(
      content: helpers.readAsStringSync(),
      throwIfDiagnostics: false,
    ).unit;
    final guidelines = <String>{};
    final defined = <String>{};
    unit.accept(
      _Collector(
        onCall: (call) {
          if (call.methodName.name == 'meetsGuideline') {
            for (final a in call.argumentList.arguments) {
              if (a is SimpleIdentifier) guidelines.add(a.name);
            }
          }
        },
        onFunction: (f) => defined.add(f.name.lexeme),
      ),
    );
    for (final guideline in _requiredGuidelines) {
      if (!guidelines.contains(guideline)) {
        failures.add(
          'a11y_helpers.dart does not assert meetsGuideline($guideline)',
        );
      }
    }
    if (!defined.contains('expectMeetsAllGuidelines')) {
      failures.add(
        'a11y_helpers.dart does not define expectMeetsAllGuidelines',
      );
    }
  }

  // Per test body: (constructed type names, calls expectMeetsAllGuidelines).
  final measured = <String>{};
  if (a11yDir.existsSync()) {
    for (final entity in a11yDir.listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('_test.dart')) continue;
      final unit = parseString(
        content: entity.readAsStringSync(),
        throwIfDiagnostics: false,
      ).unit;
      unit.accept(
        _Collector(
          onCall: (call) {
            if (!_testFunctions.contains(call.methodName.name)) return;
            final body = call.argumentList.arguments
                .whereType<FunctionExpression>()
                .firstOrNull;
            if (body == null) return;
            final inner = _Collector.gather(body);
            if (inner.calls.contains('expectMeetsAllGuidelines')) {
              measured.addAll(inner.constructed);
            }
          },
        ),
      );
    }
  }

  final screens = Directory('${root.path}/apps/client/lib/screens');
  if (!screens.existsSync()) {
    failures.add('apps/client/lib/screens not found');
    return failures;
  }
  for (final entity in screens.listSync()) {
    if (entity is! File || !entity.path.endsWith('.dart')) continue;
    final name = entity.uri.pathSegments.last;
    if (_nonScreenFiles.contains(name)) continue;
    final unit = parseString(
      content: entity.readAsStringSync(),
      throwIfDiagnostics: false,
    ).unit;
    final widgets = [
      for (final d in unit.declarations)
        if (d is ClassDeclaration &&
            _className(d) != null &&
            !_className(d)!.startsWith('_') &&
            _isWidget(d))
          _className(d)!,
    ];
    if (widgets.isEmpty) {
      failures.add('screen $name declares no public widget class');
    }
    for (final w in widgets) {
      if (!measured.contains(w)) {
        failures.add(
          'screen $name: $w is never built inside a test body (under '
          'apps/client/test/a11y/) that calls expectMeetsAllGuidelines()',
        );
      }
    }
  }
  return failures;
}

const Set<String> _testFunctions = {'test', 'testWidgets', 'a11yTest'};

String? _className(ClassDeclaration d) {
  final part = d.namePart;
  return part is NameWithTypeParameters ? part.typeName.lexeme : null;
}

bool _isWidget(ClassDeclaration d) {
  final ext = d.extendsClause?.superclass.name.lexeme ?? '';
  return ext.endsWith('Widget');
}

/// Walks a subtree gathering method-call names and constructed type names
/// (`const X()` and `X()`).
class _Collector extends RecursiveAstVisitor<void> {
  _Collector({this.onCall, this.onFunction});

  final void Function(MethodInvocation)? onCall;
  final void Function(FunctionDeclaration)? onFunction;
  final Set<String> calls = {};
  final Set<String> constructed = {};

  static _Collector gather(AstNode node) {
    final c = _Collector();
    node.accept(c);
    return c;
  }

  @override
  void visitMethodInvocation(MethodInvocation node) {
    calls.add(node.methodName.name);
    if (node.target == null) constructed.add(node.methodName.name);
    onCall?.call(node);
    super.visitMethodInvocation(node);
  }

  @override
  void visitInstanceCreationExpression(InstanceCreationExpression node) {
    constructed.add(node.constructorName.type.name.lexeme);
    super.visitInstanceCreationExpression(node);
  }

  @override
  void visitFunctionDeclaration(FunctionDeclaration node) {
    onFunction?.call(node);
    super.visitFunctionDeclaration(node);
  }
}
