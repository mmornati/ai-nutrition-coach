// tools/check_no_under_13_profiles.dart — Story 5.2 / FR-13 + FR-14
// / OQ-4.
//
// Static check: v1 ships no under-13 / teen / parent / child
// profile machinery. Walks every `.dart` file under `apps/` and
// `packages/`; rejects any reference to a banned profile type. The
// `ManagedOversightSeam` marker in
// `packages/domain_core/lib/src/value_types/managed_oversight_seam.dart`
// is the only allowed reference — and only as a marker, never as
// a behaviour surface.
//
// A regression fails the build. The named reviewer (Story 5.3)
// signs off every PR that touches user-facing copy.
//
// Run via:
//
//   dart run tools/check_no_under_13_profiles.dart
//   melos run check:release-posture   (chains this check)

import 'dart:io';

const Set<String> _bannedProfileTypes = {
  'under13',
  'childProfile',
  'minorAccount',
  'teenAccount',
  'ageGate',
  'birthDate',
  'parentAccount',
  'ChildProfile',
  'MinorAccount',
  'TeenAccount',
  'ParentAccount',
  'AgeGate',
};

void main() {
  final failures = <String>[];
  for (final entity in Directory('.').listSync(recursive: true)) {
    if (entity is! File) continue;
    if (!entity.path.endsWith('.dart')) continue;
    if (_isExempt(entity.path)) continue;
    final lines = entity.readAsLinesSync();
    for (var i = 0; i < lines.length; i++) {
      final line = lines[i].trim();
      for (final banned in _bannedProfileTypes) {
        if (_bareMentions(line, banned)) {
          failures.add('${entity.path}:${i + 1}: banned profile '
              'reference: $banned');
        }
      }
    }
  }

  if (failures.isEmpty) {
    stdout.writeln('check:no-under-13-profiles: OK — no under-13 / '
        'teen / parent / child profile machinery.');
    exit(0);
  }
  stderr.writeln('check:no-under-13-profiles: FAIL');
  for (final failure in failures) {
    stderr.writeln('  $failure');
  }
  exit(1);
}

bool _isExempt(String path) {
  // The seam marker is the only allowed reference. The check tool
  // itself + test surface + generated code.
  if (path.endsWith('check_no_under_13_profiles.dart')) return true;
  if (path.endsWith('managed_oversight_seam.dart')) return true;
  if (path.endsWith('managed_oversight_seam_test.dart')) return true;
  if (path.contains('/tools/') && path.endsWith('_check.dart')) return true;
  if (path.contains('/test/')) return true;
  if (path.contains('/integration_test/')) return true;
  if (path.endsWith('.g.dart')) return true;
  return false;
}

bool _bareMentions(String line, String banned) {
  final stripped = line.replaceAll(RegExp(r'//.*'), '');
  if (!stripped.contains(banned)) return false;
  // Skip if the reference is inside a string literal that's clearly
  // documenting the ban.
  if (line.contains('banned profile') || line.contains('banned under-13')) {
    return false;
  }
  return true;
}
