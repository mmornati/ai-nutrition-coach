// `ByokKeyStore` — the encrypted on-device key store for the
// BYOK rung (Story 3.3 / FR7 / AD-8).
//
// Wraps `flutter_secure_storage` so the BYOK key persists encrypted
// at rest (Keychain on iOS / macOS, EncryptedSharedPreferences on
// Android). On web the key is session-only — `flutter_secure_storage`
// falls back to session storage (no OS keystore); the AD-8 honest-
// difference story is documented in `docs/ai-tiers.md`.
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

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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

/// Production implementation backed by `flutter_secure_storage`
/// (Keychain on iOS / macOS, EncryptedSharedPreferences on Android).
/// On web, `flutter_secure_storage` falls back to session-only
/// storage (AD-8 honest-difference story — the key is per-session
/// on web, documented in `docs/ai-tiers.md`).
class SecureStorageByokKeyStore implements ByokKeyStore {
  SecureStorageByokKeyStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  /// The secure-storage alias. Versioned (`_v1`) so a future
  /// storage-format change can ship without colliding with
  /// existing installs.
  static const String alias = 'ai_nutrition_coach_byok_key_v1';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() async {
    return _storage.read(key: alias);
  }

  @override
  Future<void> write(String key) async {
    await _storage.write(key: alias, value: key);
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: alias);
  }

  @override
  Future<bool> hasKey() async {
    final existing = await _storage.read(key: alias);
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