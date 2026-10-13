// Key source contract (Phase 2A / D7): never mint a new key for an
// existing database.

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

/// Minimal in-memory `FlutterSecureStorage` double.
class _FakeStorage implements FlutterSecureStorage {
  final Map<String, String> data = {};
  int writes = 0;

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => data[key];

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    writes++;
    if (value == null) {
      data.remove(key);
    } else {
      data[key] = value;
    }
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('SecureKeySourceImpl', () {
    test('fresh install: generates and persists a 32-byte key', () async {
      final storage = _FakeStorage();
      final source = SecureKeySourceImpl(storage: storage);
      final result = await source.getOrCreateDbKey(databaseExists: false);
      expect(result, isA<DbKeyReady>());
      expect((result as DbKeyReady).key, hasLength(32));
      expect(storage.data[SecureStorageAliases.dbKey], isNotNull);
      // Warm start returns the same key.
      final again = await source.getOrCreateDbKey(databaseExists: true);
      expect((again as DbKeyReady).key, result.key);
    });

    test(
      'database exists + key missing -> DbKeyLost, nothing written',
      () async {
        final storage = _FakeStorage();
        final source = SecureKeySourceImpl(storage: storage);
        final result = await source.getOrCreateDbKey(databaseExists: true);
        expect(result, isA<DbKeyLost>());
        expect(storage.writes, 0);
        expect(storage.data, isEmpty);
      },
    );

    test('a stored key of the wrong length throws (typed upstream)', () async {
      final storage = _FakeStorage()
        ..data[SecureStorageAliases.dbKey] = base64.encode([1, 2, 3]);
      final source = SecureKeySourceImpl(storage: storage);
      await expectLater(
        source.getOrCreateDbKey(databaseExists: true),
        throwsFormatException,
      );
    });
  });

  group('InMemoryKeySource', () {
    test('lose() makes an existing database read as lost', () async {
      final source = InMemoryKeySource.deterministic();
      expect(
        await source.getOrCreateDbKey(databaseExists: true),
        isA<DbKeyReady>(),
      );
      source.lose();
      expect(
        await source.getOrCreateDbKey(databaseExists: true),
        isA<DbKeyLost>(),
      );
    });
  });

  test('DbKeyReady.toString is redacted', () {
    final text = DbKeyReady(Uint8List.fromList([9, 9, 9])).toString();
    expect(text, isNot(contains('9, 9')));
    expect(text, contains('redacted'));
  });
}
