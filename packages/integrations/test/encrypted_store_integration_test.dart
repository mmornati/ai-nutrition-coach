// Encryption integration test (Phase 2A / D1–D4, D7, D10).
//
// Runs under `flutter test` (and therefore `melos run test`) on any FFI
// host — real `package:sqlite3` against the SQLite3MultipleCiphers build
// the workspace-root `hooks.user_defines` selects. It goes through the
// REAL production factory (`createStores`) with only the file path and
// the key source injected, and asserts what the old code could not
// guarantee: the bytes on disk are not a plaintext SQLite file.
//
// Why this would have FAILED against the old behaviour: the old
// `_attachKey` was `async`, issued `PRAGMA key = X'..'` (not valid
// sqlite3mc syntax) and nothing verified the result, so the file was
// written as plain `SQLite format 3\0` and a wrong key still "opened".
// Tests 1, 2 and 4 below fail against that code.

import 'dart:io';
import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:drift/native.dart';
// ignore: experimental_member_use
import 'package:drift/remote.dart' show DriftRemoteException;
import 'package:integrations/src/store/app_database.dart';
import 'package:integrations/src/store/encrypted_store_adapter.dart';
import 'package:integrations/src/store/store_error_mapper.dart';
import 'package:integrations/integrations.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite3;
import 'package:test/test.dart';

const List<int> _plaintextSqliteMagic = [
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, // "SQLite f"
  0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00, // "ormat 3\0"
];

Uint8List _key(int seed) =>
    Uint8List.fromList(List<int>.generate(32, (i) => (i * 7 + seed) & 0xff));

FoodEntryDraft _apple() => FoodEntryDraft(
  databaseFood: const DatabaseFood(
    sourceRef: 'manual:apple',
    displayName: 'Zebra-striped apple',
    source: SourceCatalog.manual,
  ),
  quantity: const QuantityRange(
    low: 1,
    high: 2,
    unit: 'piece',
    displayLabel: '~1-2 pieces',
  ),
);

bool _containsBytes(Uint8List haystack, List<int> needle) {
  outer:
  for (var i = 0; i <= haystack.length - needle.length; i++) {
    for (var j = 0; j < needle.length; j++) {
      if (haystack[i + j] != needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

void main() {
  late Directory tmp;
  late String dbPath;

  setUp(() {
    tmp = Directory.systemTemp.createTempSync('openplate_enc_it_');
    dbPath = '${tmp.path}/$kDatabaseFileName';
  });

  tearDown(() {
    if (tmp.existsSync()) tmp.deleteSync(recursive: true);
  });

  Future<StoreBundle> open(SecureKeySource keys) => createStores(
    overrides: StoreOpenOverrides(databaseFilePath: dbPath, keySource: keys),
  );

  test('the linked SQLite is SQLite3MultipleCiphers (hook is honoured)', () {
    // (sqlite3mc refuses to key an in-memory database, so use a file.)
    final db = sqlite3.sqlite3.open(dbPath);
    addTearDown(db.close);
    final rows = db.select('PRAGMA cipher');
    expect(
      rows,
      isNotEmpty,
      reason:
          'plain SQLite returns no rows: the workspace-root '
          'hooks.user_defines.sqlite3.source=sqlite3mc is not applied',
    );
    attachKeyAndVerify(db, _key(1));
    expect(db.select('PRAGMA cipher').first.values.first, kPinnedCipher);
  });

  test('1. the file on disk is NOT plaintext SQLite and hides row text; '
      'reopening with the right key reads the data back', () async {
    final keys = InMemoryKeySource();
    final first = await open(keys);
    expect(first.startupFailure, isNull);

    final recorded = await first.encryptedStore.recordPlate(
      entries: [_apple()],
    );
    expect(recorded, isA<RecordPlateSuccess>());
    await first.closeDatabase!();

    final bytes = File(dbPath).readAsBytesSync();
    expect(bytes.length, greaterThanOrEqualTo(16));
    expect(
      bytes.sublist(0, 16),
      isNot(equals(_plaintextSqliteMagic)),
      reason: 'database header must not be the plaintext SQLite magic',
    );
    expect(
      _containsBytes(bytes, 'Zebra-striped apple'.codeUnits),
      isFalse,
      reason: 'row content must not appear in the file',
    );

    final second = await open(keys);
    addTearDown(() => second.closeDatabase?.call());
    expect(second.startupFailure, isNull);
    final plates = await second.encryptedStore.watchRecent().first;
    expect(plates, hasLength(1));
    expect(
      plates.single.entries.single.databaseFood.displayName,
      'Zebra-striped apple',
    );
  });

  test('2. a wrong key yields a typed failure — no exception, no data, '
      'file untouched', () async {
    final keys = InMemoryKeySource(seed: _key(1));
    final first = await open(keys);
    await first.encryptedStore.recordPlate(entries: [_apple()]);
    await first.closeDatabase!();
    final before = File(dbPath).readAsBytesSync();

    final wrong = await open(InMemoryKeySource(seed: _key(2)));
    expect(wrong.startupFailure, isNotNull);
    expect(wrong.startupFailure!.encryptedStoreError, isA<SecureKeyFailure>());
    final result = await wrong.encryptedStore.recordPlate(entries: [_apple()]);
    expect(result, isA<StoreFailure>());
    await expectLater(
      wrong.encryptedStore.watchRecent(),
      emitsError(isA<StoreStreamException>()),
    );
    final note = await wrong.coachNoteStore.forPlate(1);
    expect(note, isEmpty);

    expect(File(dbPath).readAsBytesSync(), before);
  });

  test('3. database present but key lost -> KeyLostFailure, no new key '
      'minted, file untouched', () async {
    final keys = InMemoryKeySource();
    final first = await open(keys);
    await first.encryptedStore.recordPlate(entries: [_apple()]);
    await first.closeDatabase!();
    final before = File(dbPath).readAsBytesSync();

    keys.lose();
    final lost = await open(keys);
    expect(lost.startupFailure!.encryptedStoreError, isA<KeyLostFailure>());
    expect(
      await lost.encryptedStore.recordPlate(entries: [_apple()]),
      isA<StoreFailure>(),
    );
    // A second attempt still reports lost: nothing was regenerated.
    final again = await open(keys);
    expect(again.startupFailure!.encryptedStoreError, isA<KeyLostFailure>());
    expect(File(dbPath).readAsBytesSync(), before);
  });

  test('4. a plaintext file that cannot be migrated is refused with a typed '
      'failure and never served unkeyed', () async {
    // Valid magic header, garbage body: sqlite cannot rekey it.
    File(dbPath).writeAsBytesSync([
      ..._plaintextSqliteMagic,
      ...List<int>.filled(200, 0xAB),
    ]);
    final bundle = await open(InMemoryKeySource(seed: _key(3)));
    expect(bundle.startupFailure, isNotNull);
    expect(
      await bundle.encryptedStore.recordPlate(entries: [_apple()]),
      isA<StoreFailure>(),
    );
  });

  test('a fresh install generates a key and a store that works', () async {
    final keys = InMemoryKeySource();
    final bundle = await open(keys);
    addTearDown(() => bundle.closeDatabase?.call());
    expect(bundle.startupFailure, isNull);
    expect(
      await bundle.encryptedStore.recordPlate(entries: [_apple()]),
      isA<RecordPlateSuccess>(),
    );
  });

  test('a key source that throws maps to SecureKeyFailure', () async {
    final bundle = await open(_ThrowingKeySource());
    expect(bundle.startupFailure!.encryptedStoreError, isA<SecureKeyFailure>());
  });

  test('5. legacy PLAINTEXT database is migrated in place: data kept, '
      'file now encrypted, reopens with the key', () async {
    final plain = sqlite3.sqlite3.open(dbPath);
    // Build the real schema + a row through drift's own tables by
    // creating them with plain SQL matching AppDatabase v3 is brittle, so
    // let drift create it unkeyed first.
    plain.close();
    final legacy = AppDatabase(NativeDatabase(File(dbPath)));
    final legacyStore = EncryptedStoreAdapter(database: legacy);
    final recorded = await legacyStore.recordPlate(entries: [_apple()]);
    expect(recorded, isA<RecordPlateSuccess>());
    await legacyStore.close();
    expect(
      File(dbPath).readAsBytesSync().sublist(0, 16),
      _plaintextSqliteMagic,
    );

    final keys = InMemoryKeySource(seed: _key(9));
    final bundle = await open(keys);
    addTearDown(() => bundle.closeDatabase?.call());
    expect(bundle.startupFailure, isNull);
    final plates = await bundle.encryptedStore.watchRecent().first;
    expect(plates, hasLength(1));
    expect(
      plates.single.entries.single.databaseFood.displayName,
      'Zebra-striped apple',
    );
    await bundle.closeDatabase!();
    final bytes = File(dbPath).readAsBytesSync();
    expect(bytes.sublist(0, 16), isNot(equals(_plaintextSqliteMagic)));
    expect(_containsBytes(bytes, 'Zebra-striped apple'.codeUnits), isFalse);
    // And it reopens cleanly.
    final again = await open(keys);
    addTearDown(() => again.closeDatabase?.call());
    expect(again.startupFailure, isNull);
  });

  test('plaintext DB + lost key is reported lost, never adopted', () async {
    final plain = sqlite3.sqlite3.open(dbPath);
    plain.execute('CREATE TABLE t(x); INSERT INTO t VALUES (1);');
    plain.close();
    final keys = InMemoryKeySource()..lose();
    final bundle = await open(keys);
    expect(bundle.startupFailure!.encryptedStoreError, isA<KeyLostFailure>());
  });

  test('a database that exists only as a -wal / -journal still counts as '
      'existing (key lost, not a fresh install)', () async {
    for (final suffix in ['-wal', '-journal']) {
      final f = File('$dbPath$suffix')..writeAsBytesSync([1, 2, 3]);
      final bundle = await open(InMemoryKeySource()..lose());
      expect(
        bundle.startupFailure!.encryptedStoreError,
        isA<KeyLostFailure>(),
        reason: suffix,
      );
      f.deleteSync();
    }
  });

  test('a DriftRemoteException wrapping SqliteException(26) is unwrapped '
      'to SecureKeyFailure', () async {
    // Encrypt a file, then open it from the background isolate WITHOUT a
    // key: the isolate throws SQLITE_NOTADB, which crosses as a
    // DriftRemoteException.
    final raw = sqlite3.sqlite3.open(dbPath);
    attachKeyAndVerify(raw, _key(4));
    raw.execute('CREATE TABLE t(x)');
    raw.close();
    final db = AppDatabase(NativeDatabase.createInBackground(File(dbPath)));
    Object? caught;
    try {
      await db.customSelect('SELECT count(*) FROM sqlite_master').get();
    } on Object catch (e) {
      caught = e;
    }
    await db.close().catchError((_) {});
    expect(caught, isA<DriftRemoteException>());
    expect(
      (caught! as DriftRemoteException).remoteCause,
      isA<sqlite3.SqliteException>(),
    );
    expect(mapStoreError(caught).encryptedStoreError, isA<SecureKeyFailure>());
  });
}

class _ThrowingKeySource implements SecureKeySource {
  @override
  Future<DbKeyLookup> getOrCreateDbKey({required bool databaseExists}) async =>
      throw StateError('keystore unavailable');
}
