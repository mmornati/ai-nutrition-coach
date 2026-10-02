// `LocalKeyValueStore` — the small encrypted key/value facts (schema v5).
//
// A deliberately tiny seam over `kv_table` in the encrypted database. It is
// what lets the WEB build keep the BYOK key and the AI settings encrypted at
// rest (they used to be memory-only because the only other browser store,
// `localStorage`, is readable by any script on the origin), and what holds
// `lastExportAt` on every platform.
//
// While the web store is locked there is no open database: reads then answer
// `null` ("nothing known") and writes throw [KeyValueStoreLocked], so a lock
// can never be mistaken for "the value is gone" and nothing is silently
// dropped. The web app restarts its provider scope on every lock / unlock
// (see `UnlockGate`), so values are read again after the unlock.
//
// Keys are namespaced constants ([KvKeys]); values are text (JSON for
// structured values). Nothing here ever logs a value.

import 'app_database.dart';

/// The keys stored in `kv_table`.
abstract final class KvKeys {
  /// `AiSettings` as JSON (web only; mobile uses the OS keystore).
  static const String aiSettings = 'ai.settings';

  /// The BYOK API key (web only; mobile uses the OS keystore). A secret:
  /// protected by the database key, never logged, never exported.
  static const String aiByokKey = 'ai.byokKey';

  /// UTC ISO-8601 time of the last successful export (all platforms).
  static const String exportLastAtUtc = 'export.lastAtUtc';

  /// UTC ISO-8601 time the user dismissed the quiet export suggestion.
  static const String exportReminderDismissedAtUtc =
      'export.reminderDismissedAtUtc';
}

/// Thrown by a write while the encrypted store is locked.
class KeyValueStoreLocked implements Exception {
  const KeyValueStoreLocked();

  @override
  String toString() => 'KeyValueStoreLocked()';
}

abstract interface class LocalKeyValueStore {
  /// The value for [key], or `null` when absent (or the store is locked).
  Future<String?> read(String key);

  /// Insert or replace. Throws [KeyValueStoreLocked] while locked.
  Future<void> write(String key, String value);

  /// Remove [key] (no-op when absent). Throws [KeyValueStoreLocked] while
  /// locked.
  Future<void> delete(String key);
}

/// `kv_table` of the (open) encrypted [AppDatabase]. [resolve] is asked on
/// every call, so the web store can hand out its current database (or `null`
/// while locked) without this class holding a stale handle.
class DatabaseKeyValueStore implements LocalKeyValueStore {
  DatabaseKeyValueStore(this._resolve);

  /// A store over one fixed database (native).
  DatabaseKeyValueStore.of(AppDatabase database) : _resolve = (() => database);

  final AppDatabase? Function() _resolve;

  @override
  Future<String?> read(String key) async {
    final db = _resolve();
    if (db == null) return null;
    final row = await (db.select(
      db.kvTable,
    )..where((t) => t.key.equals(key))).getSingleOrNull();
    return row?.value;
  }

  @override
  Future<void> write(String key, String value) async {
    final db = _resolve();
    if (db == null) throw const KeyValueStoreLocked();
    await db
        .into(db.kvTable)
        .insertOnConflictUpdate(
          KvTableCompanion.insert(key: key, value: value),
        );
  }

  @override
  Future<void> delete(String key) async {
    final db = _resolve();
    if (db == null) throw const KeyValueStoreLocked();
    await (db.delete(db.kvTable)..where((t) => t.key.equals(key))).go();
  }

  @override
  String toString() => 'DatabaseKeyValueStore()';
}

/// Process-memory implementation: tests and the unencrypted dev web store.
class InMemoryKeyValueStore implements LocalKeyValueStore {
  final Map<String, String> _values = {};

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async => _values[key] = value;

  @override
  Future<void> delete(String key) async => _values.remove(key);

  @override
  String toString() => 'InMemoryKeyValueStore()';
}
