// Unit tests for the shared synchronous key-attach helper (Phase 2A /
// D1, D2, D4). The missing-cipher and cipher-mismatch paths cannot be
// reached with the real sqlite3mc build, so they are driven through a
// minimal fake `CommonDatabase`.

import 'package:integrations/integrations.dart';
import 'package:sqlite3/common.dart' as sqlite3;
import 'package:test/test.dart';

/// Scripted `CommonDatabase`: records executed SQL, answers
/// `PRAGMA cipher` from [cipher] (`null` = unsupported, no rows).
class _FakeDb implements sqlite3.CommonDatabase {
  _FakeDb({this.cipher, this.throwOn});

  String? cipher;
  final String? throwOn;
  final List<String> executed = [];

  @override
  void execute(String sql, [List<Object?> parameters = const []]) {
    executed.add(sql);
    if (throwOn != null && sql.contains(throwOn!)) {
      throw sqlite3.SqliteException(
        extendedResultCode: 26,
        message: 'file is not a database',
        explanation: 'x',
        causingStatement: sql,
      );
    }
  }

  @override
  sqlite3.ResultSet select(String sql, [List<Object?> parameters = const []]) {
    if (sql == 'PRAGMA cipher') {
      return sqlite3.ResultSet(['cipher'], [null], [
        if (cipher != null) [cipher],
      ]);
    }
    if (throwOn != null && sql.contains(throwOn!)) {
      throw sqlite3.SqliteException(
        extendedResultCode: 26,
        message: 'file is not a database',
        explanation: 'x',
        causingStatement: sql,
      );
    }
    executed.add(sql);
    return sqlite3.ResultSet(['count(*)'], [null], [
      [0],
    ]);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  final key = List<int>.generate(32, (i) => i);

  test('missing cipher support throws and never issues a key pragma', () {
    final db = _FakeDb(cipher: null);
    expect(
      () => attachKeyAndVerify(db, key),
      throwsA(
        isA<StoreOpenException>().having(
          (e) => e.reason,
          'reason',
          StoreOpenFailureReason.missingCipher,
        ),
      ),
    );
    expect(db.executed, isEmpty);
  });

  test('pins the cipher, then supplies the key with hexkey, then verifies', () {
    final db = _FakeDb(cipher: kPinnedCipher);
    attachKeyAndVerify(db, key);
    expect(db.executed.first, "PRAGMA cipher = '$kPinnedCipher'");
    expect(
      db.executed[1],
      "PRAGMA hexkey = '${key.map((b) => b.toRadixString(16).padLeft(2, '0')).join()}'",
    );
    expect(db.executed.last, 'SELECT count(*) FROM sqlite_master');
    expect(db.executed.any((s) => s.contains('PRAGMA key')), isFalse);
  });

  test('a failing verification read throws keyRejected', () {
    final db = _FakeDb(cipher: kPinnedCipher, throwOn: 'sqlite_master');
    expect(
      () => attachKeyAndVerify(db, key),
      throwsA(
        isA<StoreOpenException>().having(
          (e) => e.reason,
          'reason',
          StoreOpenFailureReason.keyRejected,
        ),
      ),
    );
  });

  test('a rejected keying statement does not leak the key via the cause', () {
    final db = _FakeDb(cipher: kPinnedCipher, throwOn: 'hexkey');
    Object? thrown;
    try {
      attachKeyAndVerify(db, key);
    } on Object catch (e) {
      thrown = e;
    }
    expect(thrown, isA<StoreOpenException>());
    final text = thrown.toString();
    expect(text, isNot(contains('hexkey')));
    expect(text, isNot(contains('000102')));
  });

  test('a key of the wrong length is refused before touching the db', () {
    final db = _FakeDb(cipher: kPinnedCipher);
    expect(
      () => attachKeyAndVerify(db, [1, 2, 3]),
      throwsA(
        isA<StoreOpenException>().having(
          (e) => e.reason,
          'reason',
          StoreOpenFailureReason.invalidKey,
        ),
      ),
    );
    expect(db.executed, isEmpty);
  });

  test('attachKeyAndVerify is synchronous (returns void, not a Future)', () {
    final db = _FakeDb(cipher: kPinnedCipher);
    final Object? result = (attachKeyAndVerify as dynamic)(db, key);
    expect(result, isNull);
  });
}
