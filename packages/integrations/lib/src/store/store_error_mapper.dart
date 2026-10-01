// Store error → typed `StoreFailure` mapping (Phase 2A / D10).
//
// Every adapter boundary (`recordPlate`, `append`, `recordInteraction`,
// the open probe, the watch streams) funnels its caught error through
// `mapStoreError`, so:
//   * a `DriftRemoteException` from the background isolate is unwrapped
//     to its `remoteCause` (the previous `on SqliteException` clause
//     never matched it, so a real failure escaped as a raw exception);
//   * key / cipher problems map to `SecureKeyFailure`;
//   * every other storage error maps to `StoreOperationFailure`, so the
//     UI is no longer told "key problem" for a disk-full or locked-db
//     error.
//
// The returned value carries no cause text: SQLite messages can embed
// SQL, file paths or (for the keying statement) key material.

import 'package:domain_core/domain_core.dart';
// `remote.dart` (not `isolate.dart`) so this stays importable from the web
// build; `DriftRemoteException` is its stable, documented error type.
// ignore: experimental_member_use
import 'package:drift/remote.dart' show DriftRemoteException;
import 'package:sqlite3/common.dart' as sqlite3;

import 'sqlite_key_attach.dart';

/// SQLite primary result codes that mean "this file cannot be read with
/// this key / cipher".
const int _sqliteNotADb = 26; // SQLITE_NOTADB — wrong key or plaintext file
const int _sqliteAuth = 23; // SQLITE_AUTH

/// Map any error caught at a store boundary to a typed [StoreFailure].
/// Boundaries catch `Exception` only: a programming `Error` (assertion,
/// bad state in our own code) must surface, not be relabelled as a store
/// failure.
StoreFailure mapStoreError(Object error) {
  final cause = _unwrap(error);
  return StoreFailure(encryptedStoreError: _classify(cause));
}

EncryptedStoreFailure _classify(Object cause) {
  if (cause is StoreOpenException) return const SecureKeyFailure();
  if (cause is sqlite3.SqliteException) {
    return switch (cause.resultCode) {
      _sqliteNotADb || _sqliteAuth => const SecureKeyFailure(),
      _ => const StoreOperationFailure(),
    };
  }
  // Defensive: if the isolate boundary ever hands the cause back as plain
  // text, recognise only SQLite's own wrong-key message (exact phrase, and
  // only for a String — never for an arbitrary object's toString).
  if (cause is String && cause.contains('file is not a database')) {
    return const SecureKeyFailure();
  }
  return const StoreOperationFailure();
}

Object _unwrap(Object error) {
  var current = error;
  // A remote exception can in principle wrap another; bound the walk.
  for (var i = 0; i < 4 && current is DriftRemoteException; i++) {
    current = current.remoteCause;
  }
  return current;
}
