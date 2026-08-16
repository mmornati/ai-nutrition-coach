// tools/check_adults_only.dart — Story 5.1 / FR-13 / NFR-4.
//
// Static check: the only paths the v1 surface ships are adults-only.
// Walks every `.dart` file under `apps/`, `packages/`, and
// `tools/`; rejects any reference to a banned biometric API or an
// under-13 profile machinery. The check is part of
// `melos run check:release-posture` (Story 4.6 carries the script;
// Story 5.1 extends it).
//
// A regression fails the build. The named reviewer (Story 5.3)
// signs off every PR that touches user-facing copy.
//
// Run via:
//
//   dart run tools/check_adults_only.dart
//   melos run check:release-posture   (chains this check)

import 'dart:io';

const Set<String> _bannedBiometricImports = {
  'package:local_auth',
  'package:face_recognition',
  'package:speech_recognition',
  'package:face_detection',
  'package:voice_print',
};

const Set<String> _bannedBiometricReferences = {
  'FaceID',
  'TouchID',
  'LocalAuthentication',
  'face_detection',
  'voice_print',
  'biometric_auth',
  'face_recognition',
  'speaker_recognition',
  'faceApi',
  'rekognition',
};

const Set<String> _bannedUnder13References = {
  'under13',
  'childProfile',
  'minorAccount',
  'teenAccount',
  'ageGate',
  'birthDate',
  'parentAccount',
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
      for (final banned in _bannedBiometricImports) {
        if (line.contains('import \'$banned') ||
            line.contains('import "$banned')) {
          failures.add('${entity.path}:${i + 1}: banned biometric import: '
              '$banned');
        }
      }
      for (final banned in _bannedBiometricReferences) {
        if (_bareMentions(line, banned)) {
          failures.add('${entity.path}:${i + 1}: banned biometric '
              'reference: $banned');
        }
      }
      for (final banned in _bannedUnder13References) {
        if (_bareMentions(line, banned)) {
          failures.add('${entity.path}:${i + 1}: banned under-13 '
              'reference: $banned');
        }
      }
    }
  }

  if (failures.isEmpty) {
    stdout.writeln('check:adults-only: OK — no biometric imports, '
        'no under-13 references.');
    exit(0);
  }
  stderr.writeln('check:adults-only: FAIL');
  for (final failure in failures) {
    stderr.writeln('  $failure');
  }
  exit(1);
}

bool _isExempt(String path) {
  // The check tool itself + test surface + generated code.
  if (path.endsWith('check_adults_only.dart')) return true;
  if (path.contains('/tools/') && path.endsWith('_check.dart')) return true;
  if (path.contains('/test/')) return true;
  if (path.contains('/integration_test/')) return true;
  if (path.endsWith('.g.dart')) return true;
  return false;
}

bool _bareMentions(String line, String banned) {
  // Strip comments before scanning so a `// banned biometric reference`
  // comment doesn't fail the check.
  final stripped = line.replaceAll(RegExp(r'//.*'), '');
  if (!stripped.contains(banned)) return false;
  // Skip if the reference is inside a string literal that's clearly
  // documenting the ban (e.g., the check itself).
  if (line.contains('banned biometric') || line.contains('banned under-13')) {
    return false;
  }
  return true;
}
