// Passphrase -> key derivation for the web store (Phase 2B / W2).
//
// The web store is keyed from a user passphrase, so the KDF is the only
// thing standing between an offline attacker (who can copy the browser's
// IndexedDB) and the data: its cost is the whole defence against guessing.
//
//   * Algorithm: PBKDF2-HMAC-SHA256, the only password KDF WebCrypto
//     ships. 600,000 iterations (OWASP's 2023+ floor for this exact
//     construction), 32-byte output, per-store random 16-byte salt.
//   * Production runs it through `crypto.subtle.deriveBits`
//     (`web_crypto_kdf.dart`, web-only): native code, off the main
//     thread's JS loop, so the UI does not freeze for seconds the way the
//     previous pure-Dart loop (100k iterations) did.
//   * The pure-Dart [pbkdf2HmacSha256] below is a REFERENCE
//     implementation. It exists so the VM test-suite can pin the
//     construction against published PBKDF2-HMAC-SHA256 vectors and run
//     the whole unlock flow where WebCrypto does not exist. It is far too
//     slow for 600k iterations in the browser and is never wired into the
//     production web factory.
//
// The salt and the parameters are stored beside the data (not secret): see
// `web_store_meta.dart`.

import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// The only KDF identifier the store format knows.
const String kWebKdfPbkdf2Sha256 = 'pbkdf2-hmac-sha256';

/// Iteration count used for NEW stores.
const int kWebKdfIterations = 600000;

/// Lowest iteration count a stored store header may carry. A header below
/// this floor is refused rather than silently honoured.
const int kWebKdfMinIterations = 600000;

/// Per-store random salt length in bytes.
const int kWebStoreSaltBytes = 16;

/// Derived key length in bytes (a 256-bit sqlite3mc ChaCha20 key).
const int kWebSessionKeyBytes = 32;

/// KDF algorithm + cost, persisted with the store.
final class WebKdfParams {
  const WebKdfParams({
    this.name = kWebKdfPbkdf2Sha256,
    this.iterations = kWebKdfIterations,
  });

  final String name;
  final int iterations;

  @override
  bool operator ==(Object other) =>
      other is WebKdfParams &&
      other.name == name &&
      other.iterations == iterations;

  @override
  int get hashCode => Object.hash(name, iterations);

  @override
  String toString() => 'WebKdfParams($name, $iterations)';
}

/// Derives the store key. Takes the passphrase as UTF-8 BYTES so the caller
/// can zero the buffer afterwards (a Dart `String` cannot be wiped).
abstract interface class PassphraseKdf {
  Future<Uint8List> derive({
    required Uint8List passphrase,
    required Uint8List salt,
    required WebKdfParams params,
  });
}

/// Pure-Dart PBKDF2-HMAC-SHA256 (RFC 8018 §5.2). Reference/test only.
Uint8List pbkdf2HmacSha256({
  required List<int> password,
  required List<int> salt,
  required int iterations,
  required int length,
}) {
  if (iterations < 1) {
    throw RangeError.range(iterations, 1, null, 'iterations');
  }
  if (length < 1) {
    throw RangeError.range(length, 1, null, 'length');
  }
  final hmac = Hmac(sha256, password);
  final blocks = (length + 31) ~/ 32;
  final out = Uint8List(blocks * 32);
  for (var i = 1; i <= blocks; i++) {
    final seed = Uint8List(salt.length + 4)
      ..setRange(0, salt.length, salt)
      ..buffer.asByteData().setUint32(salt.length, i, Endian.big);
    var u = Uint8List.fromList(hmac.convert(seed).bytes);
    final t = Uint8List.fromList(u);
    for (var j = 1; j < iterations; j++) {
      u = Uint8List.fromList(hmac.convert(u).bytes);
      for (var k = 0; k < t.length; k++) {
        t[k] ^= u[k];
      }
    }
    out.setRange((i - 1) * 32, i * 32, t);
  }
  return Uint8List.sublistView(out, 0, length);
}

/// [PassphraseKdf] over the pure-Dart reference. Tests only (see above).
final class DartPbkdf2Kdf implements PassphraseKdf {
  const DartPbkdf2Kdf();

  @override
  Future<Uint8List> derive({
    required Uint8List passphrase,
    required Uint8List salt,
    required WebKdfParams params,
  }) async {
    if (params.name != kWebKdfPbkdf2Sha256) {
      throw UnsupportedError('Unknown KDF ${params.name}');
    }
    return pbkdf2HmacSha256(
      password: passphrase,
      salt: salt,
      iterations: params.iterations,
      length: kWebSessionKeyBytes,
    );
  }
}
