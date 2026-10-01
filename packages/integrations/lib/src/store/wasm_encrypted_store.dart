// Web-side `EncryptedStore` implementation (AD-8 / Phase 2B).
//
// The web build runs the same drift schema on sqlite3mc compiled to
// WebAssembly (ChaCha20-Poly1305, the cipher mobile uses), persisted in
// IndexedDB and unreadable without the passphrase-derived key. This adapter
// is a thin view over the controller's open database: while the store is
// locked, `recordPlate` returns a typed
// `StoreFailure(encryptedStoreError: WebSessionKeyFailure())` and
// `watchRecent` is empty -- no exception crosses the port. Opening, keying,
// verification, locking and erasing live in `WebStoreController`.
//
// The `AppDatabase` schema is identical to mobile (AD-3 / NFR2); the
// coach-note store (`WasmCoachNoteStore`) reads the same database.

import 'dart:async';

import 'package:domain_core/domain_core.dart';
import 'package:drift/drift.dart';

import 'app_database.dart';
import 'store_error_mapper.dart';
import 'web_store_controller.dart';

/// The web-side `EncryptedStore`.
class WasmEncryptedStore implements EncryptedStore {
  WasmEncryptedStore({required WebDatabaseSource source}) : _source = source;

  final WebDatabaseSource _source;

  /// True when the store is unlocked and the database is open.
  bool get isOpen => _source.database != null;

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
    final db = _source.database;
    if (db == null) {
      return const StoreFailure(encryptedStoreError: WebSessionKeyFailure());
    }
    final loggedAt = loggedAtUtc ?? DateTime.now().toUtc();
    final loggedAtIso = loggedAt.toUtc().toIso8601String();
    try {
      final plateLogId = await db.transaction(() async {
        final plateId = await db
            .into(db.plateLogTable)
            .insert(PlateLogTableCompanion.insert(loggedAtUtc: loggedAtIso));
        for (final entry in entries) {
          await db
              .into(db.foodEntryTable)
              .insert(
                FoodEntryTableCompanion.insert(
                  plateLogId: plateId,
                  databaseFoodSourceRef: entry.databaseFood.sourceRef,
                  databaseFoodDisplayName: entry.databaseFood.displayName,
                  databaseFoodSource: entry.databaseFood.source.name,
                  quantityLow: entry.quantity.low.toString(),
                  quantityHigh: entry.quantity.high.toString(),
                  quantityUnit: entry.quantity.unit,
                  quantityDisplayLabel: entry.quantity.displayLabel,
                ),
              );
        }
        return plateId;
      });
      final plate = await _readPlateLog(db, plateLogId, loggedAt);
      return RecordPlateSuccess(plate);
    } on Exception catch (e) {
      return mapStoreError(e);
    }
  }

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) {
    final db = _source.database;
    if (db == null) {
      // Locked session — emit a single typed failure as a synthetic
      // plate list of length zero, then close. The Day Board
      // surfaces the calm "unlock the store first" line.
      return const Stream<List<PlateLog>>.empty();
    }
    final query = db.select(db.plateLogTable)
      ..orderBy([(t) => OrderingTerm.desc(t.loggedAtUtc)]);
    if (since != null) {
      query.where(
        (t) => t.loggedAtUtc.isBiggerThanValue(since.toUtc().toIso8601String()),
      );
    }
    return query.watch().asyncMap((rows) async {
      final plates = <PlateLog>[];
      for (final row in rows) {
        final loggedAt = DateTime.parse(row.loggedAtUtc).toUtc();
        final entries = await _entriesFor(db, row.id);
        plates.add(
          PlateLog(id: row.id, loggedAtUtc: loggedAt, entries: entries),
        );
      }
      return plates;
    });
  }

  @override
  Future<void> close() => _source.lock();

  Future<PlateLog> _readPlateLog(
    AppDatabase db,
    int plateLogId,
    DateTime loggedAt,
  ) async {
    final entries = await _entriesFor(db, plateLogId);
    return PlateLog(id: plateLogId, loggedAtUtc: loggedAt, entries: entries);
  }

  Future<List<FoodEntry>> _entriesFor(AppDatabase db, int plateLogId) async {
    final query = db.select(db.foodEntryTable)
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
