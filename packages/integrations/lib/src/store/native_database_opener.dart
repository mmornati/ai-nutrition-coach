// The single io path that opens the native encrypted database
// (Phase 2A / D1, D7, D10).
//
// Both the production factory (`createStores`) and
// `EncryptedStoreAdapter.open` go through `openEncryptedStore`, so there
// is exactly one place that:
//   1. decides whether a database already exists (D7 key-loss check;
//      main file, journal or WAL non-empty) and migrates a legacy
//      PLAINTEXT file to ChaCha20-Poly1305 in place,
//   2. asks the `SecureKeySource` for the key,
//   3. hands the key to the shared synchronous `attachKeyAndVerify`
//      inside drift's `setup` callback,
//   4. EAGERLY forces the open (`SELECT 1` runs `setup` + migrations),
//      so a bad key / missing cipher surfaces here as a typed
//      `StoreOpenFailed` rather than on the first user write.
//
// No path returns a usable handle to a database that was not keyed and
// verified: if `attachKeyAndVerify` throws, the underlying open fails
// and so does the probe.

import 'dart:io';
import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:drift/native.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite3;

import 'app_database.dart';
import 'secure_key_source.dart';
import 'sqlite_key_attach.dart';
import 'store_error_mapper.dart';

/// Result of `openEncryptedStore`. Sealed so callers must handle the
/// failure; nothing throws.
sealed class StoreOpenResult {
  const StoreOpenResult();
}

/// Keyed, verified and probed. Safe to hand to the adapters.
final class StoreOpened extends StoreOpenResult {
  const StoreOpened(this.database);
  final AppDatabase database;
}

/// The open failed; [failure] is the typed reason (no cause text).
final class StoreOpenFailed extends StoreOpenResult {
  const StoreOpenFailed(this.failure);
  final StoreFailure failure;
}

/// Build the `AppDatabase` for [file] keyed with [key]. The key is
/// attached and verified synchronously inside `setup`. Prefer
/// `openEncryptedStore`, which also probes the open eagerly.
AppDatabase openEncryptedAppDatabase({
  required File file,
  required Uint8List key,
}) {
  return AppDatabase(
    NativeDatabase.createInBackground(
      file,
      setup: (raw) => attachKeyAndVerify(raw, key),
    ),
  );
}

const List<int> _plaintextMagic = [
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, // "SQLite f"
  0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00, // "ormat 3\0"
];

/// True when [file] starts with the plaintext `SQLite format 3\0` header —
/// i.e. a database written by a build that never encrypted it.
bool isPlaintextSqliteFile(File file) {
  if (!file.existsSync()) return false;
  final raf = file.openSync();
  try {
    final head = raf.readSync(16);
    if (head.length < 16) return false;
    for (var i = 0; i < 16; i++) {
      if (head[i] != _plaintextMagic[i]) return false;
    }
    return true;
  } finally {
    raf.closeSync();
  }
}

/// A database "exists" if the main file, a rollback journal or a WAL is
/// non-empty: a crash can leave data only in a sidecar, and treating that
/// as a fresh install would mint a key that cannot open it (review 5).
bool databaseExistsOnDisk(File file) {
  for (final suffix in const ['', '-journal', '-wal']) {
    final f = File('${file.path}$suffix');
    if (f.existsSync() && f.lengthSync() > 0) return true;
  }
  return false;
}

/// Encrypt a legacy PLAINTEXT database in place (review 2). Old builds
/// shipped before keying worked and wrote plain `SQLite format 3` files;
/// refusing them would strand real data.
///
/// sqlite3mc rekeying requires a non-WAL journal, so the connection is
/// switched to `DELETE` first (this also checkpoints any leftover WAL).
/// `PRAGMA hexrekey` then rewrites every page inside sqlite's own
/// rollback journal, so a failure part-way leaves the original intact.
/// The result is verified by reopening through `attachKeyAndVerify` and
/// re-checking the header. Throws on any failure; the caller maps it.
void migratePlaintextDatabase(File file, Uint8List key) {
  final raw = sqlite3.sqlite3.open(file.path);
  try {
    if (raw.select('PRAGMA cipher').isEmpty) {
      throw const StoreOpenException(StoreOpenFailureReason.missingCipher);
    }
    raw.execute('PRAGMA journal_mode = DELETE');
    raw.execute("PRAGMA cipher = '$kPinnedCipher'");
    try {
      raw.execute("PRAGMA hexrekey = '${hexEncode(key)}'");
    } on sqlite3.SqliteException {
      // Do not chain: the message would include the rekey statement.
      throw const StoreOpenException(StoreOpenFailureReason.keyRejected);
    }
  } finally {
    raw.close();
  }
  if (isPlaintextSqliteFile(file)) {
    throw const StoreOpenException(StoreOpenFailureReason.keyRejected);
  }
  final check = sqlite3.sqlite3.open(file.path);
  try {
    attachKeyAndVerify(check, key);
  } finally {
    check.close();
  }
}

/// Resolve the key for [file], open it and probe it. Never throws.
Future<StoreOpenResult> openEncryptedStore({
  required File file,
  required SecureKeySource keySource,
}) async {
  final bool databaseExists;
  final DbKeyLookup lookup;
  try {
    databaseExists = databaseExistsOnDisk(file);
    lookup = await keySource.getOrCreateDbKey(databaseExists: databaseExists);
  } on Object {
    // Secure-storage I/O or a malformed stored key.
    return const StoreOpenFailed(
      StoreFailure(encryptedStoreError: SecureKeyFailure()),
    );
  }
  final key = switch (lookup) {
    DbKeyReady(:final key) => key,
    DbKeyLost() => null,
  };
  if (key == null) {
    return const StoreOpenFailed(
      StoreFailure(encryptedStoreError: KeyLostFailure()),
    );
  }

  AppDatabase? db;
  try {
    await file.parent.create(recursive: true);
    if (isPlaintextSqliteFile(file)) {
      migratePlaintextDatabase(file, key);
    }
    db = openEncryptedAppDatabase(file: file, key: key);
    await db.customSelect('SELECT 1').get();
    return StoreOpened(db);
  } on Object catch (e) {
    try {
      await db?.close();
    } on Object {
      // The failed open may leave nothing to close.
    }
    return StoreOpenFailed(mapStoreError(e));
  }
}
