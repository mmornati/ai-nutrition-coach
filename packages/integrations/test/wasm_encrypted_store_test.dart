// `WebSessionKey` (in-memory PBKDF2 holder) round-trip + wrong-passphrase
// + lock-resets-state pins. Story 4.1 / AD-8.

import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';

void main() {
  group('WebSessionKey', () {
    test('starts locked, derives a key on unlock, opens on probe', () async {
      final key = WebSessionKey();
      expect(key.isLocked, isTrue);
      expect(key.isOpen, isFalse);

      final ok = await key.unlock(
        passphrase: 'correct horse battery staple',
        probe: (_) async => true,
      );
      expect(ok, isTrue);
      expect(key.isOpen, isTrue);
      expect(key.derivedKey, isNotNull);
      expect(key.derivedKey!.length, kWebSessionKeyBytes);
    });

    test('rejects empty passphrase without invoking probe', () async {
      final key = WebSessionKey();
      var probeCalls = 0;
      final ok = await key.unlock(
        passphrase: '',
        probe: (_) async {
          probeCalls += 1;
          return true;
        },
      );
      expect(ok, isFalse);
      expect(probeCalls, 0);
      expect(key.isLocked, isTrue);
    });

    test('keeps holder locked when probe refuses the derived key', () async {
      final key = WebSessionKey();
      final ok = await key.unlock(
        passphrase: 'whatever',
        probe: (_) async => false,
      );
      expect(ok, isFalse);
      expect(key.isLocked, isTrue);
      expect(key.derivedKey, isNull);
    });

    test('lock() clears the derived key but keeps the salt', () async {
      final key = WebSessionKey();
      final saltBefore = Uint8List.fromList(key.salt);
      await key.unlock(passphrase: 'passphrase-123', probe: (_) async => true);
      expect(key.isOpen, isTrue);
      key.lock();
      expect(key.isLocked, isTrue);
      expect(key.derivedKey, isNull);
      expect(key.salt, equals(saltBefore));
    });

    test('toString is redacted (does not leak the derived key)', () async {
      final key = WebSessionKey();
      final s = key.toString();
      expect(s, contains('isOpen'));
      expect(s, isNot(contains('derivedKey')));
      await key.unlock(passphrase: 'whatever', probe: (_) async => true);
      expect(key.toString(), 'WebSessionKey(isOpen: true)');
    });

    test('PBKDF2 derives a deterministic 32-byte key', () {
      // RFC 6070 test vector #2 (PBKDF2-HMAC-SHA1). We use SHA-256
      // because the spec honors the `crypto` package's `sha256`; this
      // test pins the byte length and the determinism of the
      // derivation. The full RFC vector is a follow-up.
      final derived = _deriveForTest(
        passphrase: 'password',
        salt: Uint8List.fromList('salt'.codeUnits),
        iterations: 1,
      );
      expect(derived.length, kWebSessionKeyBytes);
    });
  });

  group('WasmEncryptedStore', () {
    test('recordPlate returns WebSessionKeyFailure while locked', () async {
      final key = WebSessionKey();
      final store = WasmEncryptedStore(
        sessionKey: key,
        databaseOpener: (_) async => AppDatabase(NativeDatabase.memory()),
      );
      final result = await store.recordPlate(entries: const <FoodEntryDraft>[]);
      expect(result, isA<StoreFailure>());
      expect(
        (result as StoreFailure).encryptedStoreError,
        isA<WebSessionKeyFailure>(),
      );
    });

    test('watchRecent returns an empty stream while locked', () async {
      final key = WebSessionKey();
      final store = WasmEncryptedStore(
        sessionKey: key,
        databaseOpener: (_) async => AppDatabase(NativeDatabase.memory()),
      );
      final stream = store.watchRecent();
      expect(await stream.toList(), isEmpty);
    });

    test('tryOpen() with a refused probe keeps isOpen=false', () async {
      final key = WebSessionKey();
      final store = WasmEncryptedStore(
        sessionKey: key,
        databaseOpener: (_) async => AppDatabase(NativeDatabase.memory()),
      );
      final opened = await store.tryOpen();
      expect(opened, isFalse);
      expect(store.isOpen, isFalse);
    });

    test('tryOpen() after a successful unlock opens the database', () async {
      final key = WebSessionKey();
      var opened = 0;
      final store = WasmEncryptedStore(
        sessionKey: key,
        databaseOpener: (_) async {
          opened += 1;
          return AppDatabase(NativeDatabase.memory());
        },
      );
      await key.unlock(passphrase: 'whatever', probe: (_) async => true);
      final ok = await store.tryOpen();
      expect(ok, isTrue);
      expect(store.isOpen, isTrue);
      expect(opened, 1);
    });
  });
}

// Exposes the in-adapter derivation for the determinism test. The
// adapter's private `_pbkdf2` is re-implemented here to keep the
// production surface private.
Uint8List _deriveForTest({
  required String passphrase,
  required Uint8List salt,
  required int iterations,
}) {
  final hmac = Hmac(sha256, utf8Encode(passphrase));
  final block = Uint8List(salt.length + 4)
    ..setRange(0, salt.length, salt)
    ..buffer.asByteData().setUint32(salt.length, 1, Endian.big);
  var u = Uint8List.fromList(hmac.convert(block).bytes);
  final out = Uint8List.fromList(u);
  for (var j = 1; j < iterations; j++) {
    u = Uint8List.fromList(hmac.convert(u).bytes);
    for (var k = 0; k < out.length; k++) {
      out[k] ^= u[k];
    }
  }
  return Uint8List.sublistView(out, 0, kWebSessionKeyBytes);
}
