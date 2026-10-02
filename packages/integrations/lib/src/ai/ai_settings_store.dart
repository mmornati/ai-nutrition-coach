// Persistence for `AiSettings`.
//
// Where (decision, Phase 3; web revised in the PWA work, ADR-0003):
//   * mobile / desktop — platform secure storage: the Keychain / Keystore
//     item `SecureStorageAliases.rungConfig`, already wiped by "Erase all
//     local data" (D8);
//   * web — a row of `kv_table` inside the ENCRYPTED web store (schema v5):
//     `KvAiSettingsStore`. It is readable only after the passphrase unlock
//     and is deleted with the store. It is never `localStorage`
//     (`flutter_secure_storage` on web *is* localStorage, readable by any
//     script on the origin), and the settings name the third parties the
//     user trusts. The dev in-memory web store falls back to
//     `InMemoryAiSettingsStore`.

import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../store/key_value_store.dart';
import '../store/secure_storage_options.dart';
import 'ai_settings.dart';

/// Secure storage on mobile / desktop; the encrypted store's `kv_table` on
/// web ([encryptedKv]; memory only for the unencrypted dev store, which has
/// none).
AiSettingsStore createAiSettingsStore({LocalKeyValueStore? encryptedKv}) {
  if (!kIsWeb) return SecureStorageAiSettingsStore();
  return encryptedKv == null
      ? InMemoryAiSettingsStore()
      : KvAiSettingsStore(encryptedKv);
}

abstract interface class AiSettingsStore {
  /// The persisted settings; [AiSettings.defaults] when none / unreadable.
  Future<AiSettings> read();

  Future<void> write(AiSettings settings);

  Future<void> clear();
}

class SecureStorageAiSettingsStore implements AiSettingsStore {
  SecureStorageAiSettingsStore({FlutterSecureStorage? storage})
    : _storage = storage ?? _requireNativeStorage();

  static FlutterSecureStorage _requireNativeStorage() {
    if (kIsWeb) {
      throw UnsupportedError(
        'AI settings must not be persisted via flutter_secure_storage on web '
        '(it is localStorage). Use KvAiSettingsStore.',
      );
    }
    return openPlateSecureStorage;
  }

  static const String alias = SecureStorageAliases.rungConfig;

  final FlutterSecureStorage _storage;

  @override
  Future<AiSettings> read() async {
    try {
      return AiSettings.fromJsonString(
        await secureReadMigrating(_storage, alias),
      );
    } on Object {
      // An unreadable keystore must not stop the app from starting; the
      // user simply sees the no-AI default.
      return AiSettings.defaults;
    }
  }

  @override
  Future<void> write(AiSettings settings) =>
      _storage.write(key: alias, value: settings.toJsonString());

  @override
  Future<void> clear() => secureDeleteEverywhere(_storage, alias);

  @override
  String toString() => 'SecureStorageAiSettingsStore()';
}

/// `AiSettings` as one JSON row of the encrypted store (web).
class KvAiSettingsStore implements AiSettingsStore {
  KvAiSettingsStore(this._kv);

  final LocalKeyValueStore _kv;

  @override
  Future<AiSettings> read() async {
    try {
      return AiSettings.fromJsonString(await _kv.read(KvKeys.aiSettings));
    } on Object {
      // Locked or unreadable: the no-AI default, never a crash.
      return AiSettings.defaults;
    }
  }

  @override
  Future<void> write(AiSettings settings) =>
      _kv.write(KvKeys.aiSettings, settings.toJsonString());

  @override
  Future<void> clear() => _kv.delete(KvKeys.aiSettings);

  @override
  String toString() => 'KvAiSettingsStore()';
}

class InMemoryAiSettingsStore implements AiSettingsStore {
  InMemoryAiSettingsStore({AiSettings initial = AiSettings.defaults})
    : _settings = initial;

  AiSettings _settings;

  @override
  Future<AiSettings> read() async => _settings;

  @override
  Future<void> write(AiSettings settings) async => _settings = settings;

  @override
  Future<void> clear() async => _settings = AiSettings.defaults;

  @override
  String toString() => 'InMemoryAiSettingsStore()';
}
