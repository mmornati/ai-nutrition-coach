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
// unchanged from the documented baseline. A regression on any of
// these fails the build.
//
// Run via:
//
//   dart run tools/check_release_posture.dart
//   melos run check:release-posture

import 'dart:io';

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

void main() {
  final failures = <String>[];

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
      ? File('docs/no-dark-patterns-standard.md').readAsStringSync().toLowerCase()
      : '';
  for (final banned in _bannedEverywhereBaseline) {
    if (!ndp.contains(banned)) {
      failures.add(
        'NDP standard missing banned-everywhere term: "$banned"',
      );
    }
  }

  // 4. CONTRIBUTING documents build / test / smoke commands.
  final contributing = File('CONTRIBUTING.md').existsSync()
      ? File('CONTRIBUTING.md').readAsStringSync()
      : '';
  for (final command in ['melos bootstrap', 'melos run test', 'melos run smoke:self-host']) {
    if (!contributing.contains(command)) {
      failures.add('CONTRIBUTING.md missing command: $command');
    }
  }

  if (failures.isEmpty) {
    stdout.writeln('check:release-posture: OK — '
        'LICENSE, CONTRIBUTING, NDP standard at HEAD.');
    exit(0);
  }
  stderr.writeln('check:release-posture: FAIL');
  for (final failure in failures) {
    stderr.writeln('  $failure');
  }
  exit(1);
}
