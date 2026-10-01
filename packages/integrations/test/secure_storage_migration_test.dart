// Legacy-accessibility migration (Phase 2A review, finding 1).
//
// The fake partitions entries by keychain accessibility exactly like the
// Darwin plugin does (accessibility is part of the read / write / delete
// query), so an item written under the old default is invisible to the
// new options unless the helpers look under the legacy ones.

import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

class _PartitionedStorage implements FlutterSecureStorage {
  _PartitionedStorage(this._defaultAccessibility);

  final KeychainAccessibility _defaultAccessibility;
  // (accessibility, key) -> value
  final Map<(KeychainAccessibility, String), String> items = {};

  KeychainAccessibility _acc(AppleOptions? o) =>
      o?.accessibility ?? _defaultAccessibility;

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => items[(_acc(iOptions), key)];

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
    items[(_acc(iOptions), key)] = value!;
  }

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
    items.remove((_acc(iOptions), key));
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
    final acc = _acc(iOptions);
    items.removeWhere((k, _) => k.$1 == acc);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  const legacy = KeychainAccessibility.unlocked;
  const current = KeychainAccessibility.first_unlock_this_device;

  _PartitionedStorage upgraded() => _PartitionedStorage(current);

  test('DB key written under the old default survives the upgrade', () async {
    final storage = upgraded();
    final oldKey = List<int>.generate(32, (i) => i);
    storage.items[(legacy, SecureStorageAliases.dbKey)] = base64Of(oldKey);

    final result = await SecureKeySourceImpl(
      storage: storage,
    ).getOrCreateDbKey(databaseExists: true);

    expect(result, isA<DbKeyReady>());
    expect((result as DbKeyReady).key, oldKey);
    // Moved: now under the new accessibility, gone from the legacy one.
    expect(storage.items[(current, SecureStorageAliases.dbKey)], isNotNull);
    expect(storage.items[(legacy, SecureStorageAliases.dbKey)], isNull);
  });

  test('BYOK key and quota counter migrate too', () async {
    final storage = upgraded();
    storage.items[(legacy, SecureStorageAliases.byokKey)] = 'sk-test';
    storage.items[(legacy, SecureStorageAliases.quotaHostedQuota)] =
        '{"day":"2026-10-01","calls":3}';

    final byok = SecureStorageByokKeyStore(storage: storage);
    expect(await byok.read(), 'sk-test');
    expect(storage.items[(current, SecureStorageAliases.byokKey)], 'sk-test');
    expect(storage.items[(legacy, SecureStorageAliases.byokKey)], isNull);

    final quota = SecureStorageQuotaCounter(
      ceiling: 10,
      storage: storage,
      now: () => DateTime(2026, 10, 1),
    );
    expect(await quota.callsToday(), 3);
    expect(
      storage.items[(legacy, SecureStorageAliases.quotaHostedQuota)],
      isNull,
    );
  });

  test(
    'a fresh install is untouched (no legacy item, key generated)',
    () async {
      final storage = upgraded();
      final result = await SecureKeySourceImpl(
        storage: storage,
      ).getOrCreateDbKey(databaseExists: false);
      expect(result, isA<DbKeyReady>());
      expect(storage.items.keys.map((k) => k.$1).toSet(), {current});
    },
  );

  test('BYOK clear() removes the legacy copy as well', () async {
    final storage = upgraded();
    storage.items[(legacy, SecureStorageAliases.byokKey)] = 'x';
    storage.items[(current, SecureStorageAliases.byokKey)] = 'x';
    await SecureStorageByokKeyStore(storage: storage).clear();
    expect(storage.items, isEmpty);
  });

  test('the eraser deletes legacy-accessibility items', () async {
    final storage = upgraded();
    for (final a in SecureStorageAliases.all) {
      storage.items[(legacy, a)] = 'x';
      storage.items[(current, a)] = 'x';
    }
    storage.items[(legacy, 'unknown_alias')] = 'x';
    final result = await LocalDataEraserImpl(
      storage: storage,
      databaseFilePath: () async => '/nonexistent/db.sqlite',
      temporaryDirectoryPath: () async => '/nonexistent',
      documentsDirectoryPath: () async => '/nonexistent',
    ).eraseAll();
    expect(result.runtimeType.toString(), 'EraseLocalDataSuccess');
    expect(storage.items, isEmpty);
  });
}

String base64Of(List<int> bytes) => base64Encode(bytes);
