// Unit tests for the repo-gate tools (`tools/`): they must FAIL on bad input,
// not just pass on the current tree.

import 'dart:io';

import 'package:test/test.dart';

import '../../../tools/check_accessibility_floor.dart' as a11y;
import '../../../tools/check_log_hygiene.dart' as logs;
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

  group('log hygiene scanner (privacy audit)', () {
    List<String> found(String code) => [
      for (final f in logs.scanSource('apps/client/lib/x.dart', code))
        f.message,
    ];

    test('flags every print()', () {
      expect(found("void f() { print('hello'); }"), hasLength(1));
      expect(found(r"void f(x) { print('$x'); }"), hasLength(1));
      // Even with the marker: print has no allowed form in lib/.
      expect(
        found("void f() {\n  // log-hygiene: content-free\n  print('x');\n}"),
        hasLength(1),
      );
    });

    test('flags an interpolating debugPrint without the marker', () {
      expect(found(r"void f(food) { debugPrint('ate $food'); }"), hasLength(1));
      expect(found('void f(m) { debugPrint(m); }'), hasLength(1));
      expect(found(r"void f(x) { debugPrint('a ${x.name}'); }"), hasLength(1));
    });

    test('flags a marked call that interpolates a non-allow-listed name', () {
      final out = found(
        'void f(food) {\n'
        '  // log-hygiene: content-free\n'
        "  debugPrint('ate \$food');\n"
        '}',
      );
      expect(out, hasLength(1));
      expect(out.single, contains('"food"'));
      expect(
        found(
          'void f(m) {\n'
          '  // log-hygiene: content-free\n'
          '  debugPrint(m);\n'
          '}',
        ),
        hasLength(1),
        reason: 'a forwarded value is never content-free',
      );
    });

    test('accepts a constant message and marked allow-listed ids', () {
      expect(found("void f() { debugPrint('opened'); }"), isEmpty);
      expect(
        found(
          'void f(rowId, reason) {\n'
          '  // log-hygiene: content-free\n'
          "  debugPrint('row #\$rowId (\$reason)');\n"
          '}',
        ),
        isEmpty,
      );
      expect(
        found(
          'void f(w) {\n'
          "  debugPrint('x \$w'); // log-hygiene: content-free\n"
          '}',
        ),
        hasLength(1),
        reason: 'the marker on the same line does not allow-list "w"',
      );
      expect(
        found(
          'void f(step) {\n'
          "  debugPrint('x \$step'); // log-hygiene: content-free\n"
          '}',
        ),
        isEmpty,
      );
    });

    test('log() counts only when dart:developer is imported', () {
      expect(found(r"void f(x) { log('$x'); }"), isEmpty);
      expect(
        found("import 'dart:developer';\nvoid f(x) { log(x.toString()); }"),
        hasLength(1),
      );
      expect(
        found(
          "import 'dart:developer' as developer;\n"
          r"void f(x) { developer.log('$x'); }",
        ),
        hasLength(1),
      );
    });

    test('dart:developer log is caught under any import prefix', () {
      for (final imp in [
        "import 'dart:developer';",
        "import 'dart:developer' as dev;",
        "import 'dart:developer' as d;",
      ]) {
        final prefix = imp.contains(' as ')
            ? '${imp.split(' as ').last.replaceAll(';', '')}.'
            : '';
        expect(
          found("$imp\nvoid f(x) { ${prefix}log('\$x'); }"),
          hasLength(1),
          reason: imp,
        );
      }
      expect(
        found(
          "import 'dart:developer' as dev;\nvoid f() { dev.log('static'); }",
        ),
        isEmpty,
      );
    });

    test('stdout / stderr writes are checked like debugPrint', () {
      expect(
        found("import 'dart:io';\nvoid f(x) { stderr.writeln(x); }"),
        hasLength(1),
      );
      expect(
        found("import 'dart:io' as io;\nvoid f(x) { io.stdout.write('\$x'); }"),
        hasLength(1),
      );
      expect(
        found("import 'dart:io';\nvoid f() { stdout.writeln('fixed'); }"),
        isEmpty,
      );
    });

    test('print / debugPrint used as a value are flagged', () {
      expect(found('void f(l) { l.forEach(print); }'), hasLength(1));
      expect(found('void f() { final p = print; p(1); }'), hasLength(1));
      expect(found('void f(l) { l.forEach(debugPrint); }'), hasLength(1));
      expect(
        found(
          "import 'package:flutter/foundation.dart' show debugPrint;\nvoid f() { debugPrint('ok'); }",
        ),
        isEmpty,
        reason: 'a show clause and a plain call are fine',
      );
    });

    test('debugPrintThrottled / debugPrintSynchronously are debugPrints', () {
      expect(found(r"void f(x) { debugPrintThrottled('$x'); }"), hasLength(1));
      expect(
        found(r"void f(x) { debugPrintSynchronously('$x'); }"),
        hasLength(1),
      );
      expect(found("void f() { debugPrintThrottled('fixed'); }"), isEmpty);
    });

    test('package:logging Logger methods are checked', () {
      const imp = "import 'package:logging/logging.dart';\n";
      expect(found("${imp}void f(l, x) { l.info('\$x'); }"), hasLength(1));
      expect(found("${imp}void f(l, x) { l.severe(x); }"), hasLength(1));
      expect(found("${imp}void f(l) { l.fine('fixed'); }"), isEmpty);
      // Without the import, `.info` is just a method.
      expect(found(r"void f(l, x) { l.info('$x'); }"), isEmpty);
    });

    test('the repository is clean', () {
      expect(logs.scanRepo(repoRoot()), isEmpty);
    });
  });

  group('project URL rule (PV11)', () {
    final root = repoRoot();

    test('the declared default is the real project page', () {
      expect(
        posture.declaredDefaultProjectUrl(root),
        'https://github.com/mmornati/ai-nutrition-coach',
      );
    });

    test('a release build with the default (real) URL passes', () {
      for (final build in ['selfhost', 'release']) {
        expect(
          posture.checkProjectUrl(root, {'AI_NUTRITION_COACH_BUILD': build}),
          isEmpty,
          reason: build,
        );
      }
    });

    test('a release build fails on an .invalid or empty-host URL', () {
      // An explicit override that is unresolvable.
      for (final build in ['selfhost', 'release']) {
        final f = posture.checkProjectUrl(root, {
          'AI_NUTRITION_COACH_BUILD': build,
          'AI_NUTRITION_COACH_PROJECT_URL': 'https://example.invalid',
        });
        expect(f, hasLength(1), reason: build);
        expect(f.single, contains('AI_NUTRITION_COACH_PROJECT_URL'));
      }
      // A checkout whose declared default is `.invalid` (the old posture).
      final tmp = Directory.systemTemp.createTempSync('anc_posture_');
      addTearDown(() => tmp.deleteSync(recursive: true));
      File('${tmp.path}/packages/integrations/lib/src/config/app_identity.dart')
        ..createSync(recursive: true)
        ..writeAsStringSync(
          "const String kDefaultAiNutritionCoachProjectUrl = 'https://x.invalid';",
        );
      expect(
        posture.checkProjectUrl(tmp, {'AI_NUTRITION_COACH_BUILD': 'release'}),
        hasLength(1),
      );
      expect(posture.checkProjectUrl(tmp, {}), isEmpty);
    });

    test('a release build with a real URL passes', () {
      expect(
        posture.checkProjectUrl(root, {
          'AI_NUTRITION_COACH_BUILD': 'selfhost',
          'AI_NUTRITION_COACH_PROJECT_URL':
              'https://example.org/ai-nutrition-coach',
        }),
        isEmpty,
      );
    });

    test(
      'a URL that is set must be a plain https URL, whatever the flavour',
      () {
        for (final bad in [
          'http://example.org/x',
          'https://exa mple.org',
          'https://example.org/"; rm -rf /',
          "https://example.org/'x",
          r'https://example.org/$(id)',
          'ftp://example.org',
        ]) {
          expect(
            posture.checkProjectUrl(root, {
              'AI_NUTRITION_COACH_PROJECT_URL': bad,
            }),
            hasLength(1),
            reason: bad,
          );
        }
        expect(
          posture.checkProjectUrl(root, {
            'AI_NUTRITION_COACH_PROJECT_URL':
                'https://example.org:8443/ai-nutrition-coach-x',
          }),
          isEmpty,
        );
      },
    );

    test('dev builds and unlabeled runs never fail on the URL', () {
      expect(posture.checkProjectUrl(root, {}), isEmpty);
      expect(
        posture.checkProjectUrl(root, {'AI_NUTRITION_COACH_BUILD': 'dev'}),
        isEmpty,
      );
    });
  });
}
