// Log hygiene gate (privacy audit, proposed check 3).
//
// AI Nutrition Coach must never write what the user logged (food names, barcodes,
// photos, endpoints, keys) to a console or system log. This reads every
// `lib/` Dart file of the workspace from the AST and fails on:
//
//   * any `print(...)`, `stdout`/`stderr` write, or `print` / `debugPrint` used
//     as a value (a tear-off such as `forEach(print)`);
//   * a `debugPrint` (also `Throttled` / `Synchronously`), `dart:developer`
//     `log` (under any import prefix), stdout/stderr write or `package:logging`
//     `Logger` call whose
//     arguments interpolate anything (`'$x'`) or are not a plain string
//     literal, UNLESS the call carries the marker comment
//     `// log-hygiene: content-free` on one of its lines (or the line just
//     above it) AND every
//     identifier it interpolates is on [allowedLogIdentifiers] (ids, enums,
//     counts: values the code makes up, never user content).
//
// So adding a log line that could carry content fails the build until a
// person has looked at it and said so in the diff.
//
//   dart run tools/check_log_hygiene.dart
//   melos run check:release-posture   (chains this check)

import 'dart:io';

import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/source/line_info.dart';

/// The comment that marks a log call as reviewed.
const String contentFreeMarker = 'log-hygiene: content-free';

/// Identifiers that may be interpolated into a reviewed log line: row / plate /
/// note ids, step and status enums, counts and fixed reasons. Never a name,
/// barcode, endpoint, key, query or exception message.
const Set<String> allowedLogIdentifiers = {
  'id',
  'rowId',
  'plateId',
  'plateLogId',
  'noteId',
  'count',
  'length',
  'step',
  'warning',
  'reason',
  'kind',
  'status',
  'statusCode',
};

/// Source roots scanned (relative to the repository root).
const List<String> logScanRoots = [
  'apps/client/lib',
  'packages/integrations/lib',
  'packages/domain_core/lib',
];

class LogFinding {
  const LogFinding(this.path, this.line, this.message);

  final String path;
  final int line;
  final String message;

  @override
  String toString() => '$path:$line: $message';
}

/// Findings in [source] (a file named [path]).
List<LogFinding> scanSource(String path, String source) {
  final result = parseString(content: source, throwIfDiagnostics: false);
  final visitor = _LogVisitor(path, source, result.lineInfo, result.unit);
  result.unit.accept(visitor);
  return visitor.findings;
}

/// Findings across the repository at [root].
List<LogFinding> scanRepo(Directory root) {
  final findings = <LogFinding>[];
  for (final rel in logScanRoots) {
    final dir = Directory('${root.path}/$rel');
    if (!dir.existsSync()) continue;
    for (final entity in dir.listSync(recursive: true, followLinks: false)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      // Generated code is not ours to annotate.
      if (entity.path.endsWith('.g.dart')) continue;
      final shown = entity.path.substring(root.path.length + 1);
      findings.addAll(scanSource(shown, entity.readAsStringSync()));
    }
  }
  return findings;
}

class _LogVisitor extends RecursiveAstVisitor<void> {
  _LogVisitor(this.path, this.source, this.lineInfo, CompilationUnit unit) {
    for (final d in unit.directives.whereType<ImportDirective>()) {
      final uri = d.uri.stringValue ?? '';
      if (uri == 'dart:developer') {
        usesDeveloper = true;
        final prefix = d.prefix?.name;
        if (prefix != null) developerPrefixes.add(prefix);
      }
      if (uri.startsWith('package:logging/')) usesLoggingPackage = true;
    }
  }

  final String path;
  final String source;
  final LineInfo lineInfo;
  bool usesDeveloper = false;
  bool usesLoggingPackage = false;

  /// Whatever prefix `dart:developer` was imported under (`as dev`, ...).
  final Set<String> developerPrefixes = {};
  final List<LogFinding> findings = [];

  /// The `package:logging` `Logger` methods.
  static const Set<String> _loggerMethods = {
    'log',
    'finest',
    'finer',
    'fine',
    'config',
    'info',
    'warning',
    'severe',
    'shout',
  };

  /// Flutter's `debugPrint` family.
  static const Set<String> _debugPrints = {
    'debugPrint',
    'debugPrintThrottled',
    'debugPrintSynchronously',
  };

  int _line(int offset) => lineInfo.getLocation(offset).lineNumber;

  void _add(int offset, String message) =>
      findings.add(LogFinding(path, _line(offset), message));

  bool _isStdStream(Expression? target) {
    final name = switch (target) {
      SimpleIdentifier(:final name) => name,
      PrefixedIdentifier(:final identifier) => identifier.name,
      _ => null,
    };
    return name == 'stdout' || name == 'stderr';
  }

  @override
  void visitMethodInvocation(MethodInvocation node) {
    final name = node.methodName.name;
    final target = node.target;
    if (name == 'print' && target == null) {
      _add(
        node.offset,
        'print(...) is not allowed in lib/ (no console output)',
      );
    } else if (_debugPrints.contains(name) && target == null) {
      _checkLogCall(node, name);
    } else if (name == 'log' &&
        usesDeveloper &&
        (target == null ||
            (target is SimpleIdentifier &&
                (developerPrefixes.contains(target.name) ||
                    target.name == 'developer')))) {
      // dart:developer's log, under whatever prefix it was imported with.
      _checkLogCall(node, name);
    } else if (_isStdStream(target) &&
        const {
          'write',
          'writeln',
          'writeAll',
          'writeCharCode',
          'add',
          'addStream',
        }.contains(name)) {
      _checkLogCall(node, '$name on stdout/stderr');
    } else if (usesLoggingPackage &&
        target != null &&
        _loggerMethods.contains(name)) {
      _checkLogCall(node, 'Logger.$name');
    }
    super.visitMethodInvocation(node);
  }

  /// `forEach(print)`, `final f = print;`, `onError: debugPrint`: a tear-off
  /// would bypass the call checks above, so it is never allowed.
  @override
  void visitSimpleIdentifier(SimpleIdentifier node) {
    final n = node.name;
    if ((n == 'print' || _debugPrints.contains(n)) && node.inGetterContext()) {
      final parent = node.parent;
      final isCallee = parent is MethodInvocation && parent.methodName == node;
      final isDeclaration = node.inDeclarationContext();
      final isMemberName =
          parent is PrefixedIdentifier && parent.identifier == node ||
          parent is PropertyAccess && parent.propertyName == node;
      final isImportShow = parent is ShowCombinator || parent is HideCombinator;
      if (!isCallee && !isDeclaration && !isMemberName && !isImportShow) {
        _add(
          node.offset,
          '$n is used as a value (tear-off); call it directly so the '
          'argument can be checked',
        );
      }
    }
    super.visitSimpleIdentifier(node);
  }

  void _checkLogCall(MethodInvocation node, String name) {
    final identifiers = <String>{};
    var dynamicArg = false;
    for (final arg in node.argumentList.arguments) {
      final expr = arg is NamedArgument ? arg.argumentExpression : arg;
      if (expr is SimpleStringLiteral) continue;
      if (expr is StringInterpolation) {
        for (final element in expr.elements) {
          if (element is InterpolationExpression) {
            element.expression.accept(_IdentifierCollector(identifiers));
          }
        }
        continue;
      }
      dynamicArg = true;
      expr.accept(_IdentifierCollector(identifiers));
    }
    if (identifiers.isEmpty && !dynamicArg) return; // a constant message

    final first = _line(node.offset);
    final last = _line(node.end);
    final lines = source.split('\n');
    final marked = [
      for (var l = first - 1; l <= last && l <= lines.length; l++)
        if (l >= 1) lines[l - 1],
    ].any((l) => l.contains(contentFreeMarker));
    if (!marked) {
      findings.add(
        LogFinding(
          path,
          first,
          '$name(...) interpolates or forwards a value; if it is content-free '
          'mark the call with "// $contentFreeMarker" and interpolate only '
          'allow-listed identifiers',
        ),
      );
      return;
    }
    final unlisted = identifiers.difference(allowedLogIdentifiers);
    if (unlisted.isNotEmpty || dynamicArg && identifiers.isEmpty) {
      findings.add(
        LogFinding(
          path,
          first,
          '$name(...) is marked content-free but uses '
          '${unlisted.isEmpty ? "a non-literal argument" : unlisted.map((i) => '"$i"').join(', ')}'
          ' (allowed identifiers: ${(allowedLogIdentifiers.toList()..sort()).join(', ')})',
        ),
      );
    }
  }
}

/// Collects every simple identifier in an expression (`warning.step` yields
/// `warning` and `step`).
class _IdentifierCollector extends RecursiveAstVisitor<void> {
  _IdentifierCollector(this.out);
  final Set<String> out;

  @override
  void visitSimpleIdentifier(SimpleIdentifier node) {
    out.add(node.name);
  }
}

void main() {
  final findings = scanRepo(Directory.current);
  if (findings.isEmpty) {
    stdout.writeln(
      'check:log-hygiene: OK — no print(), and every interpolating '
      'debugPrint/log call is reviewed and content-free.',
    );
    exit(0);
  }
  stderr.writeln('check:log-hygiene: FAIL');
  for (final f in findings) {
    stderr.writeln('  $f');
  }
  exit(1);
}
