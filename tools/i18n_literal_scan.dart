// AST scanner behind `tools/check_i18n_literals.dart` (AD-7, Phase 7).
//
// User-facing copy must come from the ARB files (`apps/client/lib/l10n/`),
// not from string literals in widgets. This finds the literals that are
// handed straight to a user-facing sink:
//
//   * the first positional argument of `Text(...)` and the string helpers in
//     [_sinkFunctions] (`_showSnack`, `showSnack`);
//   * the value of a named argument in [_sinkNamedArgs] (`tooltip:`,
//     `semanticLabel:`, `label:`, `labelText:`, `hintText:`, ...), and the
//     owner-specific ones in [_ownerNamedArgs] (`TextSpan(text:)` and so
//     `Text.rich`, `Tooltip(message:)`, `Semantics(hint:/value:)`, ...);
//
// looking through conditionals (`a ? 'x' : 'y'`), parentheses, `+`, adjacent
// strings and every branch of a `switch` expression. A literal counts only if it carries a letter outside its
// `${...}` interpolations (so `'$a, $b'` and `'·'` pass). Anything that is
// deliberately not translatable goes in [allowList] with a reason.

library;

import 'dart:io';

import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/source/line_info.dart';

/// Constructors / functions whose first positional argument is user-facing.
const Set<String> _sinkFunctions = {'Text', '_showSnack', 'showSnack'};

/// Named arguments that are user-facing everywhere.
const Set<String> _sinkNamedArgs = {
  'tooltip',
  'semanticLabel',
  'semanticsLabel',
  'label',
  'labelText',
  'hintText',
  'helperText',
  'errorText',
  'applicationName',
  'title',
};

/// Generic names that are user-facing only on specific owners (`text:` on a
/// `TextSpan` is rendered text; `message:` on a `Tooltip`; `hint:` / `value:`
/// on `Semantics` are read out by screen readers).
const Map<String, Set<String>> _ownerNamedArgs = {
  '_Hint': {'text'},
  '_CalmLine': {'text'},
  'TextSpan': {'text'},
  'Tooltip': {'message'},
  'SnackBar': {'content'},
  'Semantics': {'hint', 'value', 'increasedValue', 'decreasedValue'},
};

/// Literals that are allowed to stay in widget code, `path -> literals`, each
/// with the reason it is not user-facing copy.
const Map<String, Set<String>> allowList = {
  // A decorative glyph used as a placeholder, not a word.
  'apps/client/lib/widgets/open_dent.dart': {'—'},
  'apps/client/lib/widgets/plate_row.dart': {'—'},
};

class I18nFinding {
  const I18nFinding(this.path, this.line, this.literal);
  final String path;
  final int line;
  final String literal;

  @override
  String toString() => '$path:$line: hard-coded UI string "$literal"';
}

/// Findings in [source] (the file at repo-relative [path]).
List<I18nFinding> scanSource(String path, String source) {
  final unit = parseString(content: source, throwIfDiagnostics: false);
  final visitor = _Visitor(path, unit.lineInfo);
  unit.unit.accept(visitor);
  final allowed = allowList[path] ?? const <String>{};
  return [
    for (final f in visitor.findings)
      if (!allowed.contains(f.literal)) f,
  ];
}

/// Scans every `.dart` file under `apps/client/lib` (except generated l10n).
List<I18nFinding> scanRepo(Directory root) {
  final out = <I18nFinding>[];
  final lib = Directory('${root.path}/apps/client/lib');
  if (!lib.existsSync()) return out;
  for (final e in lib.listSync(recursive: true)) {
    if (e is! File || !e.path.endsWith('.dart')) continue;
    final rel = e.path.substring(root.path.length + 1);
    if (rel.startsWith('apps/client/lib/l10n/')) continue;
    out.addAll(scanSource(rel, e.readAsStringSync()));
  }
  return out;
}

class _Visitor extends RecursiveAstVisitor<void> {
  _Visitor(this.path, this.lineInfo);
  final String path;
  final LineInfo lineInfo;
  final List<I18nFinding> findings = [];

  @override
  void visitInstanceCreationExpression(InstanceCreationExpression node) {
    _checkCall(node.constructorName.type.name.lexeme, node.argumentList);
    super.visitInstanceCreationExpression(node);
  }

  @override
  void visitMethodInvocation(MethodInvocation node) {
    _checkCall(node.methodName.name, node.argumentList);
    super.visitMethodInvocation(node);
  }

  void _checkCall(String name, ArgumentList args) {
    for (final arg in args.arguments) {
      if (arg is NamedArgument) {
        final label = arg.name.lexeme;
        final sink =
            _sinkNamedArgs.contains(label) ||
            (_ownerNamedArgs[name]?.contains(label) ?? false);
        if (sink) _collect(arg.argumentExpression);
      }
    }
    if (_sinkFunctions.contains(name)) {
      final positional = args.arguments.whereType<Expression>();
      if (positional.isNotEmpty) _collect(positional.first);
    }
  }

  void _collect(Expression e) {
    if (e is ParenthesizedExpression) {
      _collect(e.expression);
    } else if (e is ConditionalExpression) {
      _collect(e.thenExpression);
      _collect(e.elseExpression);
    } else if (e is BinaryExpression && e.operator.lexeme == '+') {
      _collect(e.leftOperand);
      _collect(e.rightOperand);
    } else if (e is SwitchExpression) {
      for (final c in e.cases) {
        _collect(c.expression);
      }
    } else if (e is StringLiteral) {
      final text = _literalText(e);
      if (RegExp(r'\p{L}', unicode: true).hasMatch(text)) {
        final line = lineInfo.getLocation(e.offset).lineNumber;
        findings.add(I18nFinding(path, line, text));
      }
    }
  }

  /// The literal's text with every `${...}` / `$name` interpolation removed.
  String _literalText(StringLiteral e) {
    if (e is SimpleStringLiteral) return e.value;
    if (e is AdjacentStrings) return e.strings.map(_literalText).join();
    if (e is StringInterpolation) {
      return e.elements
          .whereType<InterpolationString>()
          .map((s) => s.value)
          .join();
    }
    return '';
  }
}
