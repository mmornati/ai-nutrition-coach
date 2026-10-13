// AD-7 gate: fail if apps/client/lib passes a hard-coded string literal to a
// user-facing sink (`Text(...)`, `tooltip:`, `semanticLabel:`, `label:`,
// `labelText:`, snackbars, ...). Copy belongs in
// `apps/client/lib/l10n/app_en.arb`. See `tools/i18n_literal_scan.dart` for the
// exact rules and the allow-list of non-user-facing literals.
//
//   dart run tools/check_i18n_literals.dart
//   melos run check:release-posture   (chains this check)

import 'dart:io';

import 'i18n_literal_scan.dart';

void main() {
  final findings = scanRepo(Directory.current);
  if (findings.isEmpty) {
    stdout.writeln(
      'check:i18n-literals: OK — no hard-coded user-facing string literals '
      'in apps/client/lib.',
    );
    exit(0);
  }
  stderr.writeln(
    'check:i18n-literals: FAIL — move these into '
    'apps/client/lib/l10n/app_en.arb:',
  );
  for (final f in findings) {
    stderr.writeln('  $f');
  }
  exit(1);
}
