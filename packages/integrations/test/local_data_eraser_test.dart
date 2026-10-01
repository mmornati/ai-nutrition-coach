// `LocalDataEraserImpl` adapter test (Phase 2A / D8): real files in a temp
// directory, a recording secure-storage double.

import 'dart:io';

import 'package:domain_core/domain_core.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

class _FakeStorage implements FlutterSecureStorage {
  _FakeStorage(this.data, {this.failDeleteAll = false});

  final Map<String, String> data;
  final bool failDeleteAll;
  final List<String> deleted = [];
  bool clearedAll = false;

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    deleted.add(key);
    data.remove(key);
  }

  @override
  Future<void> deleteAll({
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (failDeleteAll) throw StateError('keystore down');
    clearedAll = true;
    data.clear();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  late Directory root;
  late Directory docs;
  late Directory tmp;
  late String dbPath;

  setUp(() {
    root = Directory.systemTemp.createTempSync('openplate_erase_');
    docs = Directory('${root.path}/docs')..createSync();
    tmp = Directory('${root.path}/tmp')..createSync();
    dbPath = '${docs.path}/$kDatabaseFileName';
  });
  tearDown(() => root.deleteSync(recursive: true));

  LocalDataEraserImpl build({
    required _FakeStorage storage,
    Future<void> Function()? close,
  }) => LocalDataEraserImpl(
    closeDatabase: close,
    storage: storage,
    databaseFilePath: () async => dbPath,
    temporaryDirectoryPath: () async => tmp.path,
    documentsDirectoryPath: () async => docs.path,
  );

  void seedFiles() {
    for (final suffix in ['', '-wal', '-shm', '-journal']) {
      File('$dbPath$suffix').writeAsStringSync('x');
    }
    Directory('${tmp.path}/$kExportSubdirectory').createSync();
    File(
      '${tmp.path}/$kExportSubdirectory/2026-01-01-openplate.csv',
    ).writeAsStringSync('a,b');
    File('${docs.path}/2025-12-31-openplate.json').writeAsStringSync('{}');
    Directory('${tmp.path}/$kSharePlusCacheSubdirectory').createSync();
    File(
      '${tmp.path}/$kSharePlusCacheSubdirectory/copy.csv',
    ).writeAsStringSync('x');
    File('${docs.path}/keep-me.txt').writeAsStringSync('unrelated');
  }

  test('erases db + sidecars, every alias, and export files', () async {
    seedFiles();
    final storage = _FakeStorage({
      for (final a in SecureStorageAliases.all) a: 'secret',
      'something_unknown': 'x',
    });
    var closed = 0;
    final result = await build(
      storage: storage,
      close: () async => closed++,
    ).eraseAll();

    expect(result, isA<EraseLocalDataSuccess>());
    expect(closed, 1);
    for (final suffix in ['', '-wal', '-shm', '-journal']) {
      expect(File('$dbPath$suffix').existsSync(), isFalse, reason: suffix);
    }
    expect(storage.deleted, containsAll(SecureStorageAliases.all));
    expect(SecureStorageAliases.all, contains('openplate_db_key_v1'));
    expect(SecureStorageAliases.all, contains('openplate_byok_key_v1'));
    expect(storage.clearedAll, isTrue);
    expect(storage.data, isEmpty);
    expect(Directory('${tmp.path}/$kExportSubdirectory').existsSync(), isFalse);
    expect(
      Directory('${tmp.path}/$kSharePlusCacheSubdirectory').existsSync(),
      isFalse,
    );
    expect(
      File('${docs.path}/2025-12-31-openplate.json').existsSync(),
      isFalse,
    );
    expect(File('${docs.path}/keep-me.txt').existsSync(), isTrue);
  });

  test('works on an already-empty device (nothing to delete)', () async {
    final result = await build(storage: _FakeStorage({})).eraseAll();
    expect(result, isA<EraseLocalDataSuccess>());
  });

  test('a failing step is reported but does not skip the others', () async {
    seedFiles();
    final storage = _FakeStorage({'a': 'b'}, failDeleteAll: true);
    final result = await build(
      storage: storage,
      close: () async => throw StateError('already closed?'),
    ).eraseAll();

    expect(result, isA<EraseLocalDataFailure>());
    final steps = (result as EraseLocalDataFailure).failedSteps;
    expect(steps, containsAll([EraseStep.closeStore, EraseStep.secureStorage]));
    expect(steps, isNot(contains(EraseStep.databaseFiles)));
    expect(File(dbPath).existsSync(), isFalse);
    expect(Directory('${tmp.path}/$kExportSubdirectory').existsSync(), isFalse);
  });

  test('through the use case: typed result, never throws', () async {
    final useCase = EraseLocalData(build(storage: _FakeStorage({})));
    expect(await useCase(), isA<EraseLocalDataSuccess>());
  });
}
