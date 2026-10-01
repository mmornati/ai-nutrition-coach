// The ONE place the sqlite3mc key is attached (Phase 2A / D1, D2, D4, L4).
//
// Used by every code path that opens the native database
// (`openEncryptedAppDatabase`, which backs both the production factory
// and `EncryptedStoreAdapter.open`). It is deliberately **synchronous**:
// drift runs the `setup` callback synchronously in the database
// isolate, so an `async` helper would let a thrown error escape as an
// unobserved future and leave the connection open and UNKEYED (the D1
// defect this replaces).
//
// Sequence (order matters for sqlite3mc):
//   1. `PRAGMA cipher` must report a cipher at all. A plain-SQLite
//      build (the `hooks.user_defines` block is not honoured) returns no
//      rows and silently ignores every other cipher pragma, so this is
//      the only way to notice. -> `missingCipher`.
//   2. `PRAGMA cipher = 'chacha20'` pins the cipher explicitly (D4)
//      BEFORE keying, so a future change of sqlite3mc's default cannot
//      silently change what is written, and so an existing file is read
//      with the cipher it was created with.
//   3. `PRAGMA hexkey = '<64 hex chars>'` (D2) supplies the raw 32-byte
//      key. (The previous `PRAGMA key = X'...'` blob literal is SQLCipher
//      syntax, not valid for sqlite3mc's `key` pragma, which takes a
//      passphrase string.)
//   4. Verify, still inside `setup`: `SELECT count(*) FROM sqlite_master`
//      succeeds. That forces a real page read + decrypt, so a wrong key
//      or an unencrypted file fails here instead of on some later query.
//      (Re-reading `PRAGMA cipher` would prove nothing: it echoes the
//      connection's configured cipher, not what is on disk, so there is
//      deliberately no "cipher mismatch" check.)
//
// Any failure throws `StoreOpenException`, which fails the open; the
// factory and adapters map it to a typed `StoreFailure`. The exception
// carries a reason enum only: never the key, the hex string, or the
// SQL (a raw `SqliteException.toString` includes the causing statement,
// which would contain the key), so the underlying exception is
// deliberately NOT chained.
//
// AD-8 cipher choice — ChaCha20-Poly1305 (`chacha20`):
//   * it is sqlite3mc's own default and its most exercised cipher;
//   * it is AEAD: every page carries a Poly1305 tag, so a flipped or
//     swapped page is detected rather than decrypted into garbage
//     (AES-256-CBC, as in `aes256cbc`, has no per-page authentication);
//   * it is fast on mobile CPUs without AES instructions.
//   SQLCipher's AES-256-CBC (`source: sqlcipher`) was rejected: its
//   build links OpenSSL on Android and its bundled SQLite lags. User
//   copy therefore says "ChaCha20-Poly1305", never "AES-256".

import 'package:sqlite3/common.dart' as sqlite3;

/// The cipher OpenPlate pins on every mobile database (AD-8 / D4).
const String kPinnedCipher = 'chacha20';

/// Why opening the encrypted database failed.
enum StoreOpenFailureReason {
  /// The linked SQLite has no multiple-ciphers support (build hook not
  /// honoured). Opening would write plaintext, so it is refused.
  missingCipher,

  /// The key is malformed (wrong length).
  invalidKey,

  /// The key was applied but the database could not be read with it
  /// (wrong key, corrupt header, or a plaintext file).
  keyRejected,
}

/// Thrown synchronously from the `setup` callback; maps to a typed
/// `StoreFailure(encryptedStoreError: SecureKeyFailure())`.
final class StoreOpenException implements Exception {
  const StoreOpenException(this.reason);

  final StoreOpenFailureReason reason;

  @override
  String toString() => 'StoreOpenException(${reason.name})';
}

/// Attach [key] to [raw] and verify the result. Synchronous; throws
/// [StoreOpenException] on any problem. See the library comment.
void attachKeyAndVerify(
  sqlite3.CommonDatabase raw,
  List<int> key, {
  String expectedCipher = kPinnedCipher,
}) {
  if (key.length != 32) {
    throw const StoreOpenException(StoreOpenFailureReason.invalidKey);
  }
  if (_activeCipher(raw) == null) {
    throw const StoreOpenException(StoreOpenFailureReason.missingCipher);
  }
  try {
    raw.execute("PRAGMA cipher = '$expectedCipher'");
    raw.execute("PRAGMA hexkey = '${hexEncode(key)}'");
  } on sqlite3.SqliteException {
    // Do not chain: the message would include the keying statement.
    throw const StoreOpenException(StoreOpenFailureReason.keyRejected);
  }
  try {
    raw.select('SELECT count(*) FROM sqlite_master');
  } on sqlite3.SqliteException {
    throw const StoreOpenException(StoreOpenFailureReason.keyRejected);
  }
}

/// The active cipher name, or `null` when the library has no cipher
/// support (a plain SQLite returns no rows for the unknown pragma).
String? _activeCipher(sqlite3.CommonDatabase raw) {
  try {
    final rows = raw.select('PRAGMA cipher');
    if (rows.isEmpty) return null;
    final value = rows.first.values.first;
    return value is String && value.isNotEmpty ? value : null;
  } on sqlite3.SqliteException {
    return null;
  }
}

/// Lower-case hex of [bytes] (for the `hexkey` / `hexrekey` pragmas).
String hexEncode(List<int> bytes) {
  final out = StringBuffer();
  for (final b in bytes) {
    out.write(b.toRadixString(16).padLeft(2, '0'));
  }
  return out.toString();
}
