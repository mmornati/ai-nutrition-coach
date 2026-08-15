// 32-byte DB key handling for the encrypted drift store (AD-8).
//
// On a fresh device the alias `openplate_db_key_v1` is absent from the
// secure storage; we generate `Random.secure().nextBytes(32)`, write it
// under that alias, and use it for every subsequent open. On a warm
// start we read the alias verbatim. If either operation throws, the
// adapter refuses to open and surfaces a typed `SecureKeyFailure`.
//
// The cold-start guarantee is "generate-or-fetch, then open — atomic":
// callers ask for the key exactly once per open, never inside the
// transaction. That keeps the secure-storage I/O outside the database
// transaction and avoids half-opened DBs.
//
// `SecureKeySource` is an interface so the integration test can swap in
// an in-memory implementation without pulling in
// `flutter_secure_storage`.

import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class SecureKeySource {
  Future<Uint8List> getOrCreateDbKey();
}

/// Production implementation backed by `flutter_secure_storage`
/// (Keychain on iOS, EncryptedSharedPreferences on Android).
class SecureKeySourceImpl implements SecureKeySource {
  SecureKeySourceImpl({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const String alias = 'openplate_db_key_v1';

  final FlutterSecureStorage _storage;

  @override
  Future<Uint8List> getOrCreateDbKey() async {
    final existing = await _storage.read(key: alias);
    if (existing != null && existing.isNotEmpty) {
      return Uint8List.fromList(base64.decode(existing));
    }
    final fresh = Random.secure().nextBytes(32);
    await _storage.write(key: alias, value: base64.encode(fresh));
    return fresh;
  }
}

/// In-memory implementation for tests — deterministic bytes, no I/O.
class InMemoryKeySource implements SecureKeySource {
  InMemoryKeySource({Uint8List? seed})
      : _key = seed ??
            Uint8List.fromList(
              List<int>.generate(32, (i) => i + 1, growable: false),
            );

  Uint8List? _key;

  @override
  Future<Uint8List> getOrCreateDbKey() async {
    final existing = _key;
    if (existing != null) return existing;
    final fresh = Random.secure().nextBytes(32);
    _key = fresh;
    return fresh;
  }
}
