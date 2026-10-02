// Unit tests for the repo-gate tools (`tools/`): they must FAIL on bad input,
// not just pass on the current tree.

import 'dart:io';

import 'package:test/test.dart';

import '../../../tools/check_accessibility_floor.dart' as a11y;
import '../../../tools/check_release_posture.dart' as posture;
import '../../../tools/i18n_literal_scan.dart';
import '_support/repo_root.dart';

void main() {
  group('i18n literal scanner', () {
    List<String> found(String body) => [
      for (final f in scanSource('apps/client/lib/x.dart', body)) f.literal,
    ];

    test('flags literals passed straight to user-facing sinks', () {
      expect(
        found('''
void f() {
  Text('Hello there');
  Text(flag ? 'On' : 'Off');
  IconButton(tooltip: 'Close', onPressed: null);
  Semantics(label: 'A label', child: x);
  _showSnack('Oops');
  InputDecoration(labelText: 'Name', hintText: "Type");
  Foo(semanticLabel: 'Pic');
  _Hint(text: 'Calm line');
}
'''),
        unorderedEquals([
          'Hello there',
          'On',
          'Off',
          'Close',
          'A label',
          'Oops',
          'Name',
          'Type',
          'Pic',
          'Calm line',
        ]),
      );
    });

    test('flags rich text, tooltips, semantics hints and switch branches', () {
      expect(
        found('''
void f(x) {
  Text.rich(TextSpan(text: 'Rich words', children: [TextSpan(text: 'More')]));
  Tooltip(message: 'Tip text', child: y);
  Semantics(hint: 'A hint', value: 'A value', child: y);
  Text(switch (x) { 1 => 'One', _ => 'Many' });
  final z = Text(switch (x) { 1 => l10n.one, _ => 'Fallback' });
}
'''),
        unorderedEquals([
          'Rich words',
          'More',
          'Tip text',
          'A hint',
          'A value',
          'One',
          'Many',
          'Fallback',
        ]),
      );
    });

    test('allows localized lookups, interpolation-only and symbols', () {
      expect(
        found(r'''
void f(c, a, b) {
  Text(c.l10n.close);
  Text('$a, $b');
  Text('·');
  Text('${a.x}');
  Semantics(label: '$a. $b');
  Other(text: 'not a sink');
  print('Hello');
}
'''),
        isEmpty,
      );
    });

    test('the current tree is clean', () {
      expect(scanRepo(repoRoot()), isEmpty);
    });
  });

  group('accessibility floor check', () {
    test('passes on the repository', () {
      expect(a11y.check(root: repoRoot()), isEmpty);
    });

    test('fails when a screen has no guideline test', () {
      final tmp = Directory.systemTemp.createTempSync('a11y_check_');
      addTearDown(() => tmp.deleteSync(recursive: true));
      File('${tmp.path}/apps/client/lib/screens/new_screen.dart')
        ..createSync(recursive: true)
        ..writeAsStringSync('class NewScreen {}');
      File('${tmp.path}/apps/client/test/a11y/a11y_helpers.dart')
        ..createSync(recursive: true)
        ..writeAsStringSync('// no guidelines here');
      final failures = a11y.check(root: tmp);
      expect(failures.any((f) => f.contains('new_screen.dart')), isTrue);
      expect(failures.any((f) => f.contains('textContrastGuideline')), isTrue);
    });

    test('a bare Semantics( in a screen no longer satisfies it', () {
      final tmp = Directory.systemTemp.createTempSync('a11y_check_');
      addTearDown(() => tmp.deleteSync(recursive: true));
      File('${tmp.path}/apps/client/lib/screens/s.dart')
        ..createSync(recursive: true)
        ..writeAsStringSync('Semantics(child: GestureDetector());');
      File('${tmp.path}/apps/client/test/a11y/a11y_helpers.dart')
        ..createSync(recursive: true)
        ..writeAsStringSync('expectMeetsAllGuidelines');
      expect(a11y.check(root: tmp), isNotEmpty);
    });

    test('a comment naming the screen, or a test that never measures, fails', () {
      final tmp = Directory.systemTemp.createTempSync('a11y_check_');
      addTearDown(() => tmp.deleteSync(recursive: true));
      File('${tmp.path}/apps/client/lib/screens/s.dart')
        ..createSync(recursive: true)
        ..writeAsStringSync('class FooScreen extends StatelessWidget {}');
      File('${tmp.path}/apps/client/test/a11y/a11y_helpers.dart')
        ..createSync(recursive: true)
        ..writeAsStringSync(
          'Future<void> expectMeetsAllGuidelines() async {\n'
          '  meetsGuideline(androidTapTargetGuideline);\n'
          '  meetsGuideline(iOSTapTargetGuideline);\n'
          '  meetsGuideline(labeledTapTargetGuideline);\n'
          '  meetsGuideline(textContrastGuideline);\n'
          '}\n',
        );
      final t = File('${tmp.path}/apps/client/test/a11y/x_test.dart')
        ..createSync(recursive: true);
      // Mentioned only in a comment / string, and built where nothing measures.
      t.writeAsStringSync(
        "// FooScreen expectMeetsAllGuidelines(\n"
        "void main() { testWidgets('a', (t) async { const FooScreen(); });\n"
        "  testWidgets('b', (t) async { expectMeetsAllGuidelines(); }); }",
      );
      expect(
        a11y.check(root: tmp).single,
        contains('FooScreen is never built'),
      );
      t.writeAsStringSync(
        "void main() { testWidgets('a', (t) async {\n"
        "  pump(const FooScreen()); await expectMeetsAllGuidelines(); }); }",
      );
      expect(a11y.check(root: tmp), isEmpty);
    });
  });

  group('README trust table proofs', () {
    Directory fixture(String table, {Map<String, String> files = const {}}) {
      final tmp = Directory.systemTemp.createTempSync('trust_table_');
      addTearDown(() => tmp.deleteSync(recursive: true));
      File(
        '${tmp.path}/README.md',
      ).writeAsStringSync('# X\n\n## Trust posture\n\n$table\n\n## Next\n');
      files.forEach((path, body) {
        File('${tmp.path}/$path')
          ..createSync(recursive: true)
          ..writeAsStringSync(body);
      });
      return tmp;
    }

    const head = '| Promise | Proof |\n| --- | --- |\n';

    test('passes on the repository', () {
      expect(posture.checkTrustTable(repoRoot()), isEmpty);
    });

    test('accepts a row whose proof exists and has a test', () {
      final d = fixture(
        '$head| It works | `t/a_test.dart` |',
        files: {'t/a_test.dart': "void main() { test('x', () {}); }"},
      );
      expect(posture.checkTrustTable(d), isEmpty);
    });

    test('rejects a row with no proof, a missing file, or no test', () {
      final d = fixture(
        '$head| Unproven | n/a |\n'
        '| Missing | `t/missing_test.dart` |\n'
        '| Empty | `t/empty_test.dart` |\n'
        '| Wrong kind | `docs/x.md` |',
        files: {'t/empty_test.dart': 'void main() {}'},
      );
      final failures = posture.checkTrustTable(d);
      expect(failures, hasLength(4));
      expect(failures.join('\n'), contains('no proof test'));
      expect(failures.join('\n'), contains('does not exist'));
      expect(failures.join('\n'), contains('contains no test'));
      expect(failures.join('\n'), contains('not a *_test.dart'));
    });

    test('hasRealTest reads calls, not text or skipped tests', () {
      expect(posture.hasRealTest("void main() { test('a', () {}); }"), isTrue);
      expect(
        posture.hasRealTest("void main() { testWidgets('a', (t) async {}); }"),
        isTrue,
      );
      expect(
        posture.hasRealTest("// test('a', () {})\nvoid main() {}"),
        isFalse,
      );
      expect(posture.hasRealTest("final s = \"test('a', () {})\";"), isFalse);
      expect(
        posture.hasRealTest("void main() { test('a', () {}, skip: true); }"),
        isFalse,
      );
      expect(
        posture.hasRealTest("void main() { test('a', () {}, skip: 'why'); }"),
        isFalse,
      );
    });

    test('rejects a table with no Proof column', () {
      final d = fixture('| Promise | Where |\n| --- | --- |\n| a | b |');
      expect(posture.checkTrustTable(d), isNotEmpty);
    });
  });
}
