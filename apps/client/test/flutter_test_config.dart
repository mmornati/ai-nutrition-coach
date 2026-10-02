// Runs before every test file in this package.
//
// Most widget tests pump a widget under a bare `MaterialApp` without the
// localization delegates; let `context.l10n` fall back to English there. The
// accessibility suite and the real-app tests install the delegates and turn
// this back off to prove the app itself never relies on the fallback.

import 'dart:async';

import 'package:openplate_client/l10n/l10n.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  debugAllowMissingL10n = true;
  await testMain();
}
