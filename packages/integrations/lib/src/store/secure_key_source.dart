// 32-byte DB key handling for the encrypted drift store (AD-8).
//
// On a fresh device the alias `ai_nutrition_coach_db_key_v1` is absent from the
// secure storage; we generate 32 randbytes via `Random.secure().nextInt(256)`
// (the API locally available on Dart 3.12.0 — the spec's `nextBytes` was
// bumped in Dart 3.4+ but the `_SecureRandom` returned by
// `Random.secure()` in this SDK ships only `nextInt/nextDouble/nextBool`),
// write it under that alias, and use it for every subsequent open. On a
// warm start we read the alias verbatim. If either operation throws, the
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

  static const String alias = 'ai_nutrition_coach_db_key_v1';

  final FlutterSecureStorage _storage;

  @override
  Future<Uint8List> getOrCreateDbKey() async {
    final existing = await _storage.read(key: alias);
    if (existing != null && existing.isNotEmpty) {
      return Uint8List.fromList(base64.decode(existing));
    }
    final fresh = _secureBytes(32);
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
    final fresh = _secureBytes(32);
    _key = fresh;
    return fresh;
  }
}

/// Generate [count] cryptographically-strong random bytes.
///
/// Throws [RangeError] when [count] is less than 1.
Uint8List _secureBytes(int count) {
  if (count <= 0) {
    throw RangeError.range(count, 1, 1 << 31, 'count');
  }
  final rng = Random.secure();
  final out = Uint8List(count);
  for (var i = 0; i < count; i++) {
    out[i] = rng.nextInt(256);
  }
  return out;
}
