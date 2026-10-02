// Pins the code-level half of the No-Dark-Patterns Standard
// (docs/no-dark-patterns-standard.md): the banned-everywhere patterns do not
// appear in shipped UI code. The named-reviewer sign-off covers copy; this
// covers what a grep can prove.

import 'dart:io';

import 'package:analyzer/dart/analysis/utilities.dart';
import 'package:analyzer/dart/ast/token.dart';
import 'package:test/test.dart';

import '_support/repo_root.dart';

/// [source] with every comment blanked out, found from the parser's tokens
/// (so `//` inside a string such as a URL is never mistaken for a comment).
String _withoutComments(String source) {
  final unit = parseString(content: source, throwIfDiagnostics: false).unit;
  final chars = source.split('');
  Token? t = unit.beginToken;
  while (t != null) {
    Token? c = t.precedingComments;
    while (c != null) {
      for (var i = c.offset; i < c.end; i++) {
        if (chars[i] != '\n') chars[i] = ' ';
      }
      c = c.next;
    }
    if (t.isEof) break;
    t = t.next;
  }
  return chars.join();
}

/// `apps/client/lib` Dart sources (comments removed), keyed by path relative
/// to `apps/client/lib`.
Map<String, String> _clientSources() {
  final lib = Directory('${repoRoot().path}/apps/client/lib');
  final out = <String, String>{};
  for (final e in lib.listSync(recursive: true)) {
    // Generated l10n holds the footnote 'no streaks · no countdowns' copy.
    if (e is File &&
        e.path.endsWith('.dart') &&
        !e.path.contains('/lib/l10n/')) {
      out[e.path.substring(lib.path.length + 1)] = _withoutComments(
        e.readAsStringSync(),
      );
    }
  }
  return out;
}

void main() {
  final sources = _clientSources();

  Iterable<String> hits(Pattern p) => [
    for (final e in sources.entries)
      if (e.value.contains(p)) e.key,
  ];

  test('no streak / badge / confetti / countdown machinery in the UI', () {
    final banned = RegExp(
      r'streak|badge|confetti|fireworks|countdown',
      caseSensitive: false,
    );
    expect(hits(banned), isEmpty);
  });

  test('no card grid on the Day Board', () {
    expect(hits(RegExp(r'\b(GridView|Card)\(')), isEmpty);
  });

  test('no push-notification or re-engagement dependency', () {
    final pubspec = File(
      '${repoRoot().path}/apps/client/pubspec.yaml',
    ).readAsStringSync();
    expect(
      pubspec,
      isNot(matches(RegExp(r'notification|firebase_messaging|onesignal'))),
    );
  });

  test(
    'no red failure colour (only the dev-store warning banner uses red)',
    () {
      final red = RegExp(
        r'Colors\.red|redAccent|0xFFB3261E|Color\(0xFFFF0000\)',
      );
      expect(
        hits(red).map((p) => p.split('/').last),
        everyElement('main.dart'),
        reason: 'the DEV in-memory banner is the one sanctioned red',
      );
    },
  );

  test('no progress spinner anywhere on screens or widgets', () {
    // The two passphrase forms show a small spinner while the key is derived
    // (not the resolve path); every other surface must use no spinner at all.
    const allowed = {
      'widgets/lock_screen_body.dart',
      'widgets/create_passphrase_body.dart',
    };
    final spinner = RegExp(
      r'CircularProgressIndicator|LinearProgressIndicator|RefreshProgressIndicator|CupertinoActivityIndicator',
    );
    expect([
      for (final e in sources.entries)
        if (e.value.contains(spinner) && !allowed.contains(e.key)) e.key,
    ], isEmpty);
  });

  test('comment stripping keeps URLs inside strings', () {
    expect(
      _withoutComments("final u = 'https://x.y/streak'; // a comment"),
      contains("'https://x.y/streak'"),
    );
    expect(_withoutComments('a // streak\nb'), isNot(contains('streak')));
  });

  test('the standard still lists every banned-everywhere pattern', () {
    final doc = File(
      '${repoRoot().path}/docs/no-dark-patterns-standard.md',
    ).readAsStringSync().toLowerCase();
    for (final term in [
      'streaks',
      'countdowns',
      'badges',
      'celebratory pop-ups',
      'push-notification re-engagement',
      'card sprawl',
      'red-guilt',
      'resolve spinners',
    ]) {
      expect(doc, contains(term));
    }
  });
}
