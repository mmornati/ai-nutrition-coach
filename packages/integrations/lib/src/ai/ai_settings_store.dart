// Persistence for `AiSettings`.
//
// Where (decision, Phase 3): platform secure storage on mobile — the
// Keychain / Keystore item `SecureStorageAliases.rungConfig`, already
// reserved for this and already wiped by "Erase all local data" (D8). The
// alternative, a table in the encrypted drift database, would need a
// schema migration plus a hand-regenerated `app_database.g.dart` and a
// second wasm implementation for a few hundred bytes of preferences; the
// secure-storage route costs none of that and inherits the eraser.
//
// On web there is deliberately NO persistent store: `flutter_secure_storage`
// on web is `localStorage`, readable by any script on the origin, and the
// settings name the third parties the user trusts. The web app uses
// `InMemoryAiSettingsStore`: preferences live for the unlocked session and
// are dropped on lock, exactly like the BYOK key they belong to (S4).

import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../store/secure_storage_options.dart';
import 'ai_settings.dart';

/// Secure storage on mobile / desktop, memory only on web.
AiSettingsStore createAiSettingsStore() =>
    kIsWeb ? InMemoryAiSettingsStore() : SecureStorageAiSettingsStore();

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
        '(it is localStorage). Use InMemoryAiSettingsStore.',
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
