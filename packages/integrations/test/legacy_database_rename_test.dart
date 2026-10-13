// One-time rename of a pre-rename (OpenPlate) database file to the
// AI Nutrition Coach file name, before the key lookup and the open.

import 'dart:io';

import 'package:integrations/integrations.dart';
import 'package:integrations/src/store/native_database_opener.dart';
import 'package:test/test.dart';

void main() {
  late Directory dir;
  late File target;
  late File legacy;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('ai_nutrition_coach_legacydb_');
    target = File('${dir.path}/$kDatabaseFileName');
    legacy = File('${dir.path}/$kLegacyDatabaseFileName');
  });
  tearDown(() => dir.deleteSync(recursive: true));

  test('the legacy name is the pre-rename one', () {
    expect(kLegacyDatabaseFileName, 'openplate_v1.sqlite');
    expect(kDatabaseFileName, 'ai_nutrition_coach_v1.sqlite');
  });

  test('moves the main file and its -wal / -shm sidecars', () {
    legacy.writeAsStringSync('main');
    File('${legacy.path}-wal').writeAsStringSync('wal');
    File('${legacy.path}-shm').writeAsStringSync('shm');

    expect(migrateLegacyDatabaseFile(target), isTrue);

    expect(target.readAsStringSync(), 'main');
    expect(File('${target.path}-wal').readAsStringSync(), 'wal');
    expect(File('${target.path}-shm').readAsStringSync(), 'shm');
    expect(legacy.existsSync(), isFalse);
    expect(File('${legacy.path}-wal').existsSync(), isFalse);
    expect(File('${legacy.path}-shm').existsSync(), isFalse);
    expect(databaseExistsOnDisk(target), isTrue);
  });

  test('never overwrites an existing new-name database', () {
    legacy.writeAsStringSync('old');
    target.writeAsStringSync('new');
    expect(migrateLegacyDatabaseFile(target), isFalse);
    expect(target.readAsStringSync(), 'new');
    expect(legacy.readAsStringSync(), 'old');
  });

  test('is a no-op on a fresh install and on other file names', () {
    expect(migrateLegacyDatabaseFile(target), isFalse);
    legacy.writeAsStringSync('old');
    expect(
      migrateLegacyDatabaseFile(File('${dir.path}/other.sqlite')),
      isFalse,
    );
    expect(legacy.existsSync(), isTrue);
  });

  test('is idempotent', () {
    legacy.writeAsStringSync('main');
    expect(migrateLegacyDatabaseFile(target), isTrue);
    expect(migrateLegacyDatabaseFile(target), isFalse);
    expect(target.readAsStringSync(), 'main');
  });
}
