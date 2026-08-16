// AD-1 invariant test: `packages/domain_core` must remain pure Dart.
//
// This test scans every `.dart` file under `lib/` and fails if any forbidden
// import shows up. It is the canonical CI gate for the architecture rule
// "UI code never imports drift/dio/mobile_scanner directly — only through
// ports, and the core never imports Flutter or I/O libraries".
//
// The check is structural (string match on `lib/**.dart`) rather than
// analyzer-based, so it does not require the analyzer to run against this
// specific package — `dart test` is enough.
//
// Robustness: comments are stripped before the scan. A forbidden import
// hidden inside `// ...`, `/// ...`, or `/* ... */` is still flagged.

import 'dart:io';

import 'package:test/test.dart';

const _forbiddenImportFragments = <String>[
  'package:flutter/',
  'package:flutter_test/',
  'package:drift/',
  'package:drift_flutter/',
  'package:dio',
  'package:mobile_scanner/',
  'package:flutter_secure_storage/', // AD-8 / Story 3.1 — secure storage is an adapter concern
  'dart:ui',
  'dart:io', // no filesystem access in the core — adapters live elsewhere
  'package:sqlite3',
  'package:http',
];

/// Strip block comments (`/* ... */`, including multi-line) and line
/// comments (`// ...` and `/// ...`) from a Dart source string. Returns
/// the source with comments replaced by spaces so line offsets are
/// preserved if we ever want to report precise error locations.
String _stripComments(String source) {
  final buf = StringBuffer();
  var i = 0;
  while (i < source.length) {
    final ch = source[i];
    final next = i + 1 < source.length ? source[i + 1] : '';
    if (ch == '/' && next == '*') {
      // Block comment: scan until */ (not nested — Dart doesn't nest them).
      buf.write('  ');
      i += 2;
      while (i + 1 < source.length) {
        if (source[i] == '*' && source[i + 1] == '/') {
          buf.write('  ');
          i += 2;
          break;
        }
        // Preserve newlines so line numbers stay meaningful downstream.
        buf.write(source[i] == '\n' ? '\n' : ' ');
        i++;
      }
    } else if (ch == '/' && next == '/') {
      // Line comment: scan until end-of-line.
      buf.write('  ');
      i += 2;
      while (i < source.length && source[i] != '\n') {
        i++;
      }
    } else if (ch == '"' || ch == "'") {
      // String literal: copy through, skipping escaped quotes.
      final quote = ch;
      buf.write(ch);
      i++;
      while (i < source.length && source[i] != quote) {
        if (source[i] == r'\' && i + 1 < source.length) {
          buf.write(source[i]);
          i++;
        }
        if (i < source.length) {
          buf.write(source[i]);
          i++;
        }
      }
      if (i < source.length) {
        buf.write(source[i]);
        i++;
      }
    } else {
      buf.write(ch);
      i++;
    }
  }
  return buf.toString();
}

void main() {
  group('AD-1: domain_core purity', () {
    test('lib/ contains no forbidden imports', () async {
      final libDir = Directory('lib');
      expect(libDir.existsSync(), isTrue,
          reason: 'lib/ directory must exist for the core package.');

      final offenders = <String>[];

      await for (final entity in libDir.list(recursive: true)) {
        if (entity is! File) continue;
        if (!entity.path.endsWith('.dart')) continue;

        final raw = await entity.readAsString();
        final stripped = _stripComments(raw);
        final lines = stripped.split('\n');
        for (var i = 0; i < lines.length; i++) {
          final line = lines[i].trim();
          if (!line.startsWith("import") && !line.startsWith("export") &&
              !line.startsWith("part")) {
            continue;
          }
          for (final fragment in _forbiddenImportFragments) {
            if (line.contains(fragment)) {
              offenders.add(
                '${entity.path}:${i + 1}  →  $line\n'
                '   contains forbidden fragment: "$fragment"',
              );
            }
          }
        }
      }

      expect(
        offenders,
        isEmpty,
        reason: 'AD-1 violation — domain_core must remain pure Dart:\n'
            '${offenders.join('\n')}',
      );
    });

    test('pubspec.yaml has no Flutter / I-O dependencies', () async {
      final pubspec = File('pubspec.yaml');
      expect(pubspec.existsSync(), isTrue);

      final content = await pubspec.readAsString();
      const forbiddenDeps = <String>[
        'flutter:',
        'drift:',
        'dio:',
        'mobile_scanner:',
        'flutter_secure_storage:',
        'sqlite3',
        'http:',
      ];
      final offenders = <String>[];
      for (final dep in forbiddenDeps) {
        if (content.contains('\n  $dep')) {
          offenders.add(dep);
        }
      }
      expect(
        offenders,
        isEmpty,
        reason: 'pubspec.yaml must not declare these deps: $offenders',
      );
    });
  });
}
