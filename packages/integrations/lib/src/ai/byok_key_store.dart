// `ByokKeyStore` — the encrypted on-device key store for the
// BYOK rung (Story 3.3 / FR7 / AD-8).
//
// Wraps `flutter_secure_storage` so the BYOK key persists encrypted
// at rest (Keychain on iOS / macOS, EncryptedSharedPreferences on
// Android).
//
// Web (S4, revised for the PWA, ADR-0003): the key is stored in a row of the
// ENCRYPTED web store (`kv_table`, schema v5): `KvByokKeyStore`. It is
// readable only after the passphrase unlock, protected by the same
// passphrase-derived key as the plates, and deleted with the store.
// `SecureStorageByokKeyStore` still refuses to be built on web, because
// `flutter_secure_storage`'s web backend is `localStorage` (readable by any
// script on the origin, survives the lock screen); `purgeLegacyWebSecure
// Storage` removes anything an older build left there. Locking the web store
// restarts the provider scope and the key is not read again until the next
// unlock. See `docs/ai-tiers.md`.
//
// FR7 / NFR4: the key never appears in any string the store
// produces. `toString()` returns `ByokKeyStore(hasKey: <bool>)` —
// no key material in any form. The store never logs the key, never
// reflects it in error envelopes, and never serializes it to disk
// outside the secure storage.
//
// FR13: no biometric identification. The key store is never tied
// to a device fingerprint or a user identity.

import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../store/key_value_store.dart';
import '../store/secure_storage_options.dart';

/// The encrypted on-device key store for the BYOK rung (FR7).
abstract interface class ByokKeyStore {
  /// Read the stored key, or `null` if no key is stored.
  Future<String?> read();

  /// Persist [key] encrypted at rest. Overwrites any existing
  /// key. The key never leaves the device except as the
  /// `Authorization` header on the user's own request.
  Future<void> write(String key);

  /// Remove the stored key (if any). The store returns to the
  /// "no key" state and the active rung can flip back to the
  /// previous rung.
  Future<void> clear();

  /// True if a key is stored, false otherwise. Never returns the
  /// key itself.
  Future<bool> hasKey();
}

/// The platform-appropriate key store: the OS keystore on mobile / desktop;
/// the encrypted store's `kv_table` on web ([encryptedKv]; memory only for
/// the unencrypted dev store, which has none). Never `localStorage` (S4).
ByokKeyStore createByokKeyStore({LocalKeyValueStore? encryptedKv}) {
  if (!kIsWeb) return SecureStorageByokKeyStore();
  return encryptedKv == null
      ? InMemoryByokKeyStore()
      : KvByokKeyStore(encryptedKv);
}

/// The only part of a saved key the UI may ever show: its last four
/// characters, and only when the key is long enough (12+) that four
/// characters are a small fraction of it. `null` otherwise. Never the
/// start of the key (that identifies the provider and key family).
String? byokKeyEndingHint(String? key) {
  if (key == null || key.length < 12) return null;
  return key.substring(key.length - 4);
}

/// Production implementation backed by `flutter_secure_storage`
/// (Keychain on iOS / macOS, EncryptedSharedPreferences on Android).
/// NOT available on web — see the library comment; use
/// [createByokKeyStore].
class SecureStorageByokKeyStore implements ByokKeyStore {
  SecureStorageByokKeyStore({FlutterSecureStorage? storage})
    : _storage = storage ?? _requireNativeStorage();

  static FlutterSecureStorage _requireNativeStorage() {
    if (kIsWeb) {
      throw UnsupportedError(
        'The BYOK key must never be stored via flutter_secure_storage on web '
        '(it is localStorage). Use KvByokKeyStore / createByokKeyStore().',
      );
    }
    return openPlateSecureStorage;
  }

  /// The secure-storage alias. Versioned (`_v1`) so a future
  /// storage-format change can ship without colliding with
  /// existing installs.
  static const String alias = SecureStorageAliases.byokKey;

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() async {
    return secureReadMigrating(_storage, alias);
  }

  @override
  Future<void> write(String key) async {
    await _storage.write(key: alias, value: key);
  }

  @override
  Future<void> clear() async {
    await secureDeleteEverywhere(_storage, alias);
  }

  @override
  Future<bool> hasKey() async {
    final existing = await secureReadMigrating(_storage, alias);
    return existing != null && existing.isNotEmpty;
  }

  /// `toString` is intentionally redacted (FR7 / NFR4). Never
  /// surface the key in any string the store produces.
  @override
  String toString() {
    // Note: this is a sync `toString` so it cannot read the
    // secure storage; the `hasKey` flag here is a conservative
    // `null` — UI surfaces `hasKey()` via the async API instead.
    return 'ByokKeyStore(hasKey: null)';
  }
}

/// The web implementation: the key is one row of the encrypted store. It is
/// only readable while the store is unlocked (a locked store reads as "no
/// key"; a write while locked throws, and the caller reports a storage
/// failure rather than pretending it saved).
class KvByokKeyStore implements ByokKeyStore {
  KvByokKeyStore(this._kv);

  final LocalKeyValueStore _kv;

  @override
  Future<String?> read() => _kv.read(KvKeys.aiByokKey);

  @override
  Future<void> write(String key) => _kv.write(KvKeys.aiByokKey, key);

  @override
  Future<void> clear() => _kv.delete(KvKeys.aiByokKey);

  @override
  Future<bool> hasKey() async {
    final existing = await _kv.read(KvKeys.aiByokKey);
    return existing != null && existing.isNotEmpty;
  }

  /// Redacted like every key store (FR7 / NFR4).
  @override
  String toString() => 'KvByokKeyStore()';
}

/// In-memory implementation for tests — deterministic key, no I/O.
/// The store's `toString` is redacted (`hasKey: <bool>`) just like
/// the production adapter.
class InMemoryByokKeyStore implements ByokKeyStore {
  InMemoryByokKeyStore({String? seed}) : _key = seed;

  String? _key;

  @override
  Future<String?> read() async => _key;

  @override
  Future<void> write(String key) async {
    _key = key;
  }

  @override
  Future<void> clear() async {
    _key = null;
  }

  @override
  Future<bool> hasKey() async => _key != null && _key!.isNotEmpty;

  /// Redacted `toString` (FR7 / NFR4).
  @override
  String toString() => 'ByokKeyStore(hasKey: ${_key != null})';
}

/// A view of [inner] that only yields the key while it is being used for the
/// host it was entered for. [boundHost] is the host recorded when the key was
/// saved (empty = unknown, e.g. a key saved by an older build);
/// [endpointHost] is the host of the endpoint the request would go to. On any
/// mismatch the key reads as ABSENT, so the rung reports "key missing" and
/// nothing is sent — editing the endpoint can never redirect a key to a new
/// server. Writes and clears pass through.
class HostBoundByokKeyStore implements ByokKeyStore {
  const HostBoundByokKeyStore({
    required this.inner,
    required this.boundHost,
    required this.endpointHost,
  });

  final ByokKeyStore inner;
  final String boundHost;
  final String endpointHost;

  bool get _matches =>
      boundHost.isNotEmpty &&
      endpointHost.isNotEmpty &&
      boundHost.toLowerCase() == endpointHost.toLowerCase();

  @override
  Future<String?> read() async => _matches ? inner.read() : null;

  @override
  Future<bool> hasKey() async => _matches && await inner.hasKey();

  @override
  Future<void> write(String key) => inner.write(key);

  @override
  Future<void> clear() => inner.clear();

  @override
  String toString() => 'HostBoundByokKeyStore()';
}
