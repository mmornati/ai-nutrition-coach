// `EncryptedStore` mobile implementation — drift on sqlite3mc with
// AES-256 at rest (AD-8).
//
// The adapter owns:
//   * the drift `AppDatabase`,
//   * the `SecureKeySource` (cold-start key generation),
//   * the row → domain entity mapping (`_toPlateLog`, `_toFoodEntry`),
//   * the boundary that converts `drift.Exceptions` to typed
//     `StoreFailure` values so the port never throws.
//
// `recordPlate` runs a single drift transaction that inserts the parent
// `PlateLogTable` row, then each `FoodEntryTable` row with the assigned
// `plateLogId`. `watchRecent` exposes a query stream — every commit
// triggers a fresh emit (drift's `Stream` is the underlying mechanism
// behind AD-3's "derived view" rule).
//
// Encryption (AD-8): the workspace pubspec.yaml opts into the sqlite3mc
// source via `hooks.user_defines.sqlite3.source`. The `setup` callback
// here runs `PRAGMA key = ...` against the raw database with the
// 32-byte key from `SecureKeySource`. The cipher pragma is checked at
// runtime so a misconfigured build surfaces as a typed `StoreFailure`
// instead of silently writing plaintext.

import 'dart:async';
import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite3;

import 'package:domain_core/domain_core.dart';

import 'app_database.dart';
import 'secure_key_source.dart';

class EncryptedStoreAdapter implements EncryptedStore {
  EncryptedStoreAdapter({
    required AppDatabase database,
  }) : _db = database;

  /// Convenience for production: builds an `AppDatabase` against a file
  /// on disk, opens it with the sqlite3mc key pragma, and yields a
  /// ready adapter.
  ///
  /// Tests should call the named-args constructor directly with
  /// `AppDatabase(NativeDatabase.memory())` + an in-memory key source.
  static Future<EncryptedStoreAdapter> open({
    required String filePath,
    required SecureKeySource keySource,
  }) async {
    final key = await keySource.getOrCreateDbKey();
    final db = AppDatabase(NativeDatabase.createInBackground(
      File(filePath),
      setup: (sqlite3.Database raw) => _attachKey(raw, key),
    ));
    return EncryptedStoreAdapter(database: db);
  }

  final AppDatabase _db;

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
    final loggedAt = loggedAtUtc ?? DateTime.now().toUtc();
    final loggedAtIso = loggedAt.toUtc().toIso8601String();
    try {
      final plateLogId = await _db.transaction(() async {
        final plateId = await _db.into(_db.plateLogTable).insert(
              PlateLogTableCompanion.insert(loggedAtUtc: loggedAtIso),
            );
        for (final entry in entries) {
          await _db.into(_db.foodEntryTable).insert(
                FoodEntryTableCompanion.insert(
                  plateLogId: plateId,
                  databaseFoodSourceRef: entry.databaseFood.sourceRef,
                  databaseFoodDisplayName: entry.databaseFood.displayName,
                  databaseFoodSource: entry.databaseFood.source.name,
                  quantityLow: _formatNum(entry.quantity.low),
                  quantityHigh: _formatNum(entry.quantity.high),
                  quantityUnit: entry.quantity.unit,
                  quantityDisplayLabel: entry.quantity.displayLabel,
                ),
              );
        }
        return plateId;
      });

      final committed = await _readPlateLog(plateLogId, loggedAt);
      return RecordPlateSuccess(committed);
    } on sqlite3.SqliteException catch (_) {
      return const StoreFailure(encryptedStoreError: SecureKeyFailure());
    }
  }

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) {
    final query = _db.select(_db.plateLogTable)
      ..orderBy([(t) => OrderingTerm.desc(t.loggedAtUtc)]);
    if (since != null) {
      query.where((t) => t.loggedAtUtc.isBiggerThanValue(since.toUtc().toIso8601String()));
    }
    return query.watch().asyncMap((rows) async {
      final plates = <PlateLog>[];
      for (final row in rows) {
        final loggedAt = DateTime.parse(row.loggedAtUtc).toUtc();
        final entries = await _entriesFor(row.id);
        plates.add(
          PlateLog(
            id: row.id,
            loggedAtUtc: loggedAt,
            entries: entries,
          ),
        );
      }
      return plates;
    });
  }

  @override
  Future<void> close() => _db.close();

  Future<PlateLog> _readPlateLog(int plateLogId, DateTime loggedAt) async {
    final entries = await _entriesFor(plateLogId);
    return PlateLog(
      id: plateLogId,
      loggedAtUtc: loggedAt,
      entries: entries,
    );
  }

  Future<List<FoodEntry>> _entriesFor(int plateLogId) async {
    final query = _db.select(_db.foodEntryTable)
      ..where((t) => t.plateLogId.equals(plateLogId))
      ..orderBy([(t) => OrderingTerm.asc(t.id)]);
    final rows = await query.get();
    return rows
        .map(
          (r) => FoodEntry(
            id: r.id,
            plateLogId: r.plateLogId,
            databaseFood: DatabaseFood(
              sourceRef: r.databaseFoodSourceRef,
              displayName: r.databaseFoodDisplayName,
              source: _parseSource(r.databaseFoodSource),
            ),
            quantity: QuantityRange(
              low: _parseNum(r.quantityLow),
              high: _parseNum(r.quantityHigh),
              unit: r.quantityUnit,
              displayLabel: r.quantityDisplayLabel,
            ),
          ),
        )
        .toList(growable: false);
  }
}

Future<void> _attachKey(sqlite3.Database raw, List<int> key) async {
  if (!_hasCipher(raw)) {
    throw const _MissingCipherFailure();
  }
  final hex = StringBuffer('X\'');
  for (final b in key) {
    hex.write(b.toRadixString(16).padLeft(2, '0'));
  }
  hex.write('\'');
  raw.execute("PRAGMA key = $hex");
}

class _MissingCipherFailure implements Exception {
  const _MissingCipherFailure();
  @override
  String toString() =>
      'sqlite3mc cipher pragma is missing — the build did not pick up '
      'the sqlite3mc hook. Check pubspec.yaml `hooks.user_defines`.';
}

bool _hasCipher(sqlite3.Database raw) {
  try {
    final rows = raw.select('PRAGMA cipher');
    return rows.isNotEmpty && rows.first.values.first != null;
  } on Object {
    return false;
  }
}

String _formatNum(num n) => n.toString();

num _parseNum(String raw) {
  if (raw.contains('.') || raw.contains('e') || raw.contains('E')) {
    return double.parse(raw);
  }
  return int.parse(raw);
}

SourceCatalog _parseSource(String raw) {
  for (final candidate in SourceCatalog.values) {
    if (candidate.name == raw) return candidate;
  }
  return SourceCatalog.manual;
}
