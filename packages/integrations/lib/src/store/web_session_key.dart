// In-memory holder for the web rung's session key (AD-8 / Story 4.1).
//
// The web build is "session-sealed" — a passphrase-derived PBKDF2 key
// is held in memory for the session lifetime only. A page reload or
// session restart requires the user to re-enter the passphrase. The
// key bytes are never persisted to `window.localStorage`, `IndexedDB`,
// or any web-side storage.
//
// The class is a process-wide singleton. The singleton-ness is what
// makes the lock-screen → Day Board transition work without the UI
// re-asking for the passphrase on every navigation. The `lock()`
// method is the typed way to clear state (e.g., a manual "lock the
// store" affordance in Settings → Your data, v1.1 follow-up).
//
// `toString` is intentionally redacted — the holder carries key
// material, so the string representation must never include it.

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

/// The default PBKDF2 iteration count. Tuned for a sub-200ms
/// derivation on a current device — same order of magnitude as the
/// Web Crypto API defaults. Honored by the spec; the constant is
/// declared in one place so the v1.1 follow-up can tune it without
/// touching the call sites.
const int kWebPbkdf2Iterations = 100_000;

/// The default key length in bytes. 32 bytes (256 bits) matches the
/// `WasmEncryptedStore` cipher (drift's `WebSqlCipher` from
/// `drift_flutter`) and the mobile story's AES-256.
const int kWebSessionKeyBytes = 32;

/// The default salt length in bytes. The salt is bound to the
/// installed WebAssembly bundle (a per-app constant) so the derived
/// key is not portable across installations.
const int kWebSessionSaltBytes = 16;

class WebSessionKey {
  WebSessionKey._({
    required this.salt,
    required this.iterations,
  });

  /// Process-wide singleton. `lock()` clears the derived key
  /// without clearing the salt (so the same passphrase still opens
  /// the store after a manual lock).
  static final WebSessionKey _instance = WebSessionKey._(
    salt: _defaultSalt(),
    iterations: kWebPbkdf2Iterations,
  );

  /// Returns the process-wide session-key holder. The holder is
  /// always non-null; the key material is null until `unlock` is
  /// called with a valid passphrase.
  factory WebSessionKey() => _instance;

  /// The per-app salt. Bound to the installed WebAssembly bundle so
  /// the derived key is not portable across installations.
  final Uint8List salt;

  /// The PBKDF2 iteration count.
  final int iterations;

  /// The derived key material, or `null` while the session is
  /// locked. Held in memory only — never written to disk.
  Uint8List? _derived;

  /// True when the session is unlocked. Reads are idempotent; the
  /// UI subscribes to this to decide whether to render the lock
  /// screen or the Day Board.
  bool get isOpen => _derived != null;

  /// True when the holder has no derived key. The Day Board
  /// surfaces the lock screen while `isOpen` is false.
  bool get isLocked => _derived == null;

  /// Derive the session key from the user-supplied [passphrase] via
  /// PBKDF2-HMAC-SHA256. Returns `true` if the derived key
  /// successfully opens the wasm store; `false` if the derivation
  /// succeeds but the store refuses the key (in v1 the only store
  /// is the same drift schema; a wrong passphrase produces a
  /// non-matching key and the store refuses). The lock screen
  /// renders the calm "that passphrase does not open this store"
  /// line on `false`.
  ///
  /// The derivation is pure-Dart; no network call, no JS-interop,
  /// no `window.crypto`. The passphrase is wiped from local
  /// references as soon as the derivation finishes.
  Future<bool> unlock({
    required String passphrase,
    required Future<bool> Function(Uint8List derivedKey) probe,
  }) async {
    if (passphrase.isEmpty) return false;
    final derived = _pbkdf2(
      passphrase: passphrase,
      salt: salt,
      iterations: iterations,
      keyLengthBytes: kWebSessionKeyBytes,
    );
    final ok = await probe(derived);
    if (ok) {
      _derived = derived;
      return true;
    }
    // Probe refused — keep the holder locked. Don't keep the wrong
    // key in memory.
    return false;
  }

  /// Clear the derived key. The salt and iteration count remain so
  /// the same passphrase still opens the store after a manual lock.
  void lock() {
    _derived = null;
  }

  /// Dev-only — forcibly unlock the session without a passphrase.
  /// The dev-in-memory path calls this so the lock screen is skipped
  /// in local development.
  void forceUnlock() {
    _derived = Uint8List(kWebSessionKeyBytes);
  }

  /// Returns the derived key, or `null` while the session is
  /// locked. The `WasmEncryptedStore` reads this when it needs to
  /// open the underlying database; if the key is null it returns
  /// `StoreFailure(encryptedStoreError: WebSessionKeyFailure())`.
  Uint8List? get derivedKey => _derived;

  @override
  String toString() => 'WebSessionKey(isOpen: $isOpen)';
}

/// Per-app salt, bound to the installed bundle. Hard-coded in v1 —
/// the bundle is the constant; a v1.1 follow-up can derive it from
/// the wasm binary's hash so different installations get different
/// salts.
Uint8List _defaultSalt() {
  // ASCII "ai-nutrition-coach-web-v1" — 25 bytes, truncated to the
  // first 16 bytes to form the salt. The salt is a per-app constant;
  // it does not need to be cryptographically random (it is a
  // per-app label, not a per-secret nonce). PBKDF2's security
  // comes from the user-supplied passphrase.
  final raw = utf8.encode('ai-nutrition-coach-web-v1');
  return Uint8List.fromList(raw.sublist(0, kWebSessionSaltBytes));
}

/// Pure-Dart PBKDF2-HMAC-SHA256. The `crypto` package ships
/// `Hmac(sha256)`; this iterates the HMAC the requested number of
/// times per RFC 2898 §5.2.
Uint8List _pbkdf2({
  required String passphrase,
  required Uint8List salt,
  required int iterations,
  required int keyLengthBytes,
}) {
  if (iterations < 1) {
    throw RangeError.range(iterations, 1, 1 << 31, 'iterations');
  }
  if (keyLengthBytes < 1 || keyLengthBytes > 64) {
    throw RangeError.range(keyLengthBytes, 1, 64, 'keyLengthBytes');
  }
  final hmac = Hmac(sha256, utf8.encode(passphrase));
  // Number of HMAC blocks needed. SHA-256 produces 32 bytes per
  // block, so 32 bytes per block × ceil(keyLengthBytes / 32) blocks.
  final blockCount = (keyLengthBytes + 31) ~/ 32;
  final out = Uint8List(blockCount * 32);
  for (var i = 1; i <= blockCount; i++) {
    final blockSalt = Uint8List(salt.length + 4)
      ..setRange(0, salt.length, salt)
      ..buffer.asByteData().setUint32(salt.length, i, Endian.big);
    // U_1 = HMAC(password, salt || INT(i))
    var u = Uint8List.fromList(hmac.convert(blockSalt).bytes);
    final block = Uint8List.fromList(u);
    // U_j = HMAC(password, U_{j-1}); T = U_1 XOR U_2 XOR ... XOR U_c
    for (var j = 1; j < iterations; j++) {
      u = Uint8List.fromList(hmac.convert(u).bytes);
      for (var k = 0; k < block.length; k++) {
        block[k] ^= u[k];
      }
    }
    out.setRange((i - 1) * 32, i * 32, block);
  }
  return Uint8List.sublistView(out, 0, keyLengthBytes);
}
