// 32-byte DB key handling for the encrypted drift store (AD-8).
//
// On a fresh install the alias `openplate_db_key_v1` is absent from the
// secure storage and no database file exists; we generate 32 random
// bytes via `Random.secure()`, write them under that alias, and use them
// for every subsequent open. On a warm start we read the alias verbatim.
//
// D7: the key is NEVER regenerated for an existing database. When the
// alias is absent but the database file exists, the key was lost
// (restored backup, keystore reset, device migration) and a freshly
// minted key could only produce a permanent "can't open". The source
// returns the distinct typed `DbKeyLost` state instead; the app offers
// the explicit "Erase local data and start over" action (D8).
//
// Failures reading / writing the secure storage (or a stored value that
// is not a 32-byte base64 key) throw; the factory maps that to a typed
// `SecureKeyFailure`.
//
// `SecureKeySource` is an interface so tests can swap in an in-memory
// implementation without pulling in `flutter_secure_storage`.

import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'secure_storage_options.dart';

/// Required key length in bytes.
const int kDbKeyLength = 32;

/// Outcome of asking a [SecureKeySource] for the database key.
sealed class DbKeyLookup {
  const DbKeyLookup();
}

/// The key to open (or create) the database with. `toString` is
/// redacted so the key never reaches a log.
final class DbKeyReady extends DbKeyLookup {
  const DbKeyReady(this.key);

  final Uint8List key;

  @override
  String toString() => 'DbKeyReady(<redacted ${key.length} bytes>)';
}

/// D7 — the database file exists but its key is gone.
final class DbKeyLost extends DbKeyLookup {
  const DbKeyLost();

  @override
  String toString() => 'DbKeyLost()';
}

abstract interface class SecureKeySource {
  /// Fetch the database key, generating one only when [databaseExists]
  /// is false. When the database exists and no key is stored, returns
  /// [DbKeyLost] and writes nothing.
  Future<DbKeyLookup> getOrCreateDbKey({required bool databaseExists});
}

/// Production implementation backed by `flutter_secure_storage`
/// (Keychain on iOS, Keystore-wrapped preferences on Android).
class SecureKeySourceImpl implements SecureKeySource {
  SecureKeySourceImpl({FlutterSecureStorage? storage})
    : _storage = storage ?? openPlateSecureStorage;

  static const String alias = SecureStorageAliases.dbKey;

  final FlutterSecureStorage _storage;

  @override
  Future<DbKeyLookup> getOrCreateDbKey({required bool databaseExists}) async {
    final existing = await secureReadMigrating(_storage, alias);
    if (existing != null && existing.isNotEmpty) {
      final bytes = Uint8List.fromList(base64.decode(existing));
      if (bytes.length != kDbKeyLength) {
        throw const FormatException('stored database key has a bad length');
      }
      return DbKeyReady(bytes);
    }
    if (databaseExists) return const DbKeyLost();
    final fresh = _secureBytes(kDbKeyLength);
    await _storage.write(key: alias, value: base64.encode(fresh));
    return DbKeyReady(fresh);
  }
}

/// In-memory implementation for tests — no I/O. Pass [seed] to start
/// with a known key; omit it to start with NO key (so a database that
/// already exists reads as lost, exactly like production).
class InMemoryKeySource implements SecureKeySource {
  InMemoryKeySource({Uint8List? seed}) : _key = seed;

  /// A deterministic 32-byte key for tests that need a stable value.
  factory InMemoryKeySource.deterministic() => InMemoryKeySource(
    seed: Uint8List.fromList(
      List<int>.generate(kDbKeyLength, (i) => i + 1, growable: false),
    ),
  );

  Uint8List? _key;

  /// Forget the key, simulating a lost Keychain / Keystore entry.
  void lose() => _key = null;

  @override
  Future<DbKeyLookup> getOrCreateDbKey({required bool databaseExists}) async {
    final existing = _key;
    if (existing != null) return DbKeyReady(existing);
    if (databaseExists) return const DbKeyLost();
    final fresh = _secureBytes(kDbKeyLength);
    _key = fresh;
    return DbKeyReady(fresh);
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
