// The versioned wasm file name the app requests must match the version the
// fetch script pins and downloads (and `pubspec.lock`'s sqlite3).

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';

void main() {
  test('kWebSqliteWasmPath carries the fetch script\'s pinned version', () {
    final script = File('../../scripts/fetch_web_sqlite.sh').readAsStringSync();
    final version = RegExp(r'SQLITE3_VERSION="([^"]+)"').firstMatch(script)![1];
    expect(kWebSqliteWasmPath, 'sqlite3mc-$version.wasm');
    final lock = File('../../pubspec.lock').readAsStringSync();
    final locked = RegExp(
      r'\n  sqlite3:\n(?:    .*\n)*?    version: "([^"]+)"',
    ).firstMatch(lock)![1];
    expect(locked, version);
  });
}
