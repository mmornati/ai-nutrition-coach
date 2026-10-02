// The storage seam of the web store (Phase 2B).
//
// `WebDatabaseBackend` hides WHERE the keyed database lives. Production
// (`indexeddb_sqlite3mc_backend.dart`, web only) is sqlite3mc compiled to
// WebAssembly with an IndexedDB-backed file system; VM tests plug in a
// file-backed sqlite3mc database, so the unlock/create/lock logic runs
// against REAL encryption and a REAL "reload" without a browser.
//
// Both go through the same `attachWebKey`, which is the mobile
// `attachKeyAndVerify` (cipher presence check, pinned cipher, `hexkey`,
// forced page decrypt) plus the web-only existence check. The key is
// therefore verified by actually decrypting before the database is ever used
// (W3) -- there is no separate "probe" that can disagree with the real open.

import 'dart:typed_data';

import 'package:sqlite3/common.dart' as sqlite3;

import 'app_database.dart';
import 'sqlite_key_attach.dart';
import 'store_error_mapper.dart';

/// Versioned wasm file name, derived from the `sqlite3` pin in
/// `scripts/fetch_web_sqlite.sh` (a test keeps the two in step). The version
/// in the URL keeps nginx's `immutable` caching valid across upgrades.
const String kWebSqliteWasmPath = 'sqlite3mc-3.5.1.wasm';

abstract interface class WebDatabaseBackend {
  /// Whether persisted database bytes exist. Where the browser cannot tell
  /// (no `indexedDB.databases()`), `false`: creating then fails closed
  /// (a wrong key cannot open an existing store) rather than wiping it.
  Future<bool> exists();

  /// The header copy kept next to the data, or `null`.
  Future<String?> readHeaderCopy();

  /// Persist a header copy next to the data.
  Future<void> writeHeaderCopy(String header);

  /// Open the database keyed with [key], creating it when absent.
  ///
  /// [expectExisting] is true for a returning user: the database MUST already
  /// hold a schema, otherwise the open is refused (`dataMissing`) instead of
  /// minting an empty store. Throws `StoreOpenException` for a rejected key,
  /// a missing cipher or missing data; any other error means the storage
  /// itself is unavailable. On any failure nothing is left open.
  Future<AppDatabase> open(Uint8List key, {required bool expectExisting});

  /// Delete every persisted byte of the database, its journals and the
  /// header copy.
  Future<void> erase();
}

/// Keyed `setup` callback shared by every backend. Synchronous, throws
/// `StoreOpenException` (never carrying the key).
void attachWebKey(
  sqlite3.CommonDatabase raw,
  List<int> key, {
  required bool expectExisting,
}) {
  attachKeyAndVerify(raw, key);
  if (!expectExisting) return;
  final rows = raw.select('SELECT count(*) FROM sqlite_master');
  final count = rows.isEmpty ? 0 : rows.first.values.first;
  if (count is! int || count == 0) {
    throw const StoreOpenException(StoreOpenFailureReason.dataMissing);
  }
}

/// Force the lazy open (runs `setup` then drift's migrations) and close the
/// handle if it fails, so a rejected key never leaves a live connection.
Future<AppDatabase> openAndProbe(AppDatabase database) async {
  try {
    await database.customSelect('SELECT 1').get();
    return database;
  } on Object {
    try {
      await database.close();
    } on Object {
      // A failed open may leave nothing to close.
    }
    rethrow;
  }
}

/// How a failed open should be presented.
enum WebOpenFailure {
  /// The passphrase-derived key does not decrypt the store.
  wrongKey,

  /// The header promises data the storage no longer holds.
  dataMissing,

  /// The storage or cipher is unusable in this browser/build.
  unavailable,

  /// The data was written by a NEWER schema than this build knows: reload to
  /// get the newer build (never a wrong-passphrase, never counted as one).
  newerVersion,
}

WebOpenFailure classifyWebOpenError(Object error) {
  final cause = unwrapStoreCause(error);
  if (cause is SchemaTooNewException) return WebOpenFailure.newerVersion;
  if (cause is StoreOpenException) {
    return switch (cause.reason) {
      StoreOpenFailureReason.keyRejected => WebOpenFailure.wrongKey,
      StoreOpenFailureReason.dataMissing => WebOpenFailure.dataMissing,
      StoreOpenFailureReason.missingCipher ||
      StoreOpenFailureReason.invalidKey => WebOpenFailure.unavailable,
    };
  }
  if (cause is sqlite3.SqliteException && cause.resultCode == 26) {
    return WebOpenFailure.wrongKey; // SQLITE_NOTADB
  }
  return WebOpenFailure.unavailable;
}
