// The self-hosted barcode decoder (ADR-0003): the path the app asks for, the
// version the fetch script pins, and the mobile_scanner it was reviewed
// against must all agree, and the pins must be real SHA-256 values.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/state/scanner_adapters.dart';

void main() {
  final script = File('../../scripts/fetch_web_zxing.sh').readAsStringSync();
  String pin(String name) => RegExp('$name="([^"]+)"').firstMatch(script)![1]!;

  test('the script version matches the path the app loads the reader from', () {
    expect(pin('ZXING_WASM_VERSION'), kWebZxingVersion);
    expect(kWebZxingReaderScriptPath, 'zxing/$kWebZxingVersion/reader.js');
  });

  test('the script was reviewed against the locked mobile_scanner', () {
    final lock = File('../../pubspec.lock').readAsStringSync();
    final locked = RegExp(
      r'\n  mobile_scanner:\n(?:    .*\n)*?    version: "([^"]+)"',
    ).firstMatch(lock)![1];
    expect(locked, pin('MOBILE_SCANNER_REVIEWED'));
  });

  test('every pin is a SHA-256 and the download is https from npm', () {
    for (final name in const [
      'ZXING_TARBALL_SHA256',
      'ZXING_READER_PATCHED_SHA256',
      'ZXING_WASM_SHA256',
    ]) {
      expect(pin(name), matches(RegExp(r'^[0-9a-f]{64}$')), reason: name);
    }
    expect(script, contains('https://registry.npmjs.org/zxing-wasm/-/'));
    expect(script, isNot(contains('http://')));
    expect(script, contains('set -euo pipefail'));
  });

  test(
    'it fails closed: a checksum mismatch aborts before anything is shipped',
    () {
      expect(script, contains('checksum mismatch'));
      expect(
        RegExp(r'exit 1').allMatches(script).length,
        greaterThanOrEqualTo(3),
      );
    },
  );

  test('the build, the image and the local runner all run it', () {
    final pubspec = File('../../pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('bash scripts/fetch_web_zxing.sh'));
    expect(
      File('../../infra/Dockerfile').readAsStringSync(),
      contains('scripts/fetch_web_zxing.sh'),
    );
    expect(
      File('../../scripts/run_local_web.sh').readAsStringSync(),
      contains('fetch_web_zxing.sh'),
    );
    expect(
      File('../../.github/workflows/ci.yml').readAsStringSync(),
      contains('fetch_web_zxing.sh'),
    );
  });
}
