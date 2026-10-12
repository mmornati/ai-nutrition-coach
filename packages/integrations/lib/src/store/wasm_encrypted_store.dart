// Web-side `EncryptedStore` implementation (AD-8 / Story 4.1).
//
// The web build runs the same drift schema on `sqlite3.wasm` with a
// PBKDF2-derived session key held in memory for the session lifetime
// only. A page reload or session restart requires the user to
// re-enter the passphrase. The key material never crosses the
// `domain_core` boundary: only the boolean "is set" assertion does.
//
// This adapter's job is to read the `WebSessionKey` holder, hold the
// `AppDatabase` open against the derived key, and surface typed
// `WebSessionKeyFailure` results while the session is locked. The
// actual `sqlite3.wasm` open + the drift `WebSqlCipher` binding
// (from `drift_flutter`) is the v1.1 build-plumbing follow-up; the
// architecture is in place so the cipher binding drops in behind
// the same `EncryptedStore` port.
//
// The `AppDatabase` schema is identical to mobile (AD-3 / NFR2) —
// the wasm store reuses the same `AppDatabase` class the mobile
// `EncryptedStoreAdapter` opens. The `setup` callback on the wasm
// side will pass the derived key to the wasm SQLCipher; v1.1 wires
// that. Until then the store opens against the unencrypted wasm
// database and the AD-8 honest copy ("session-sealed, not at-rest
// encrypted") holds: the schema is sealed by the in-memory key, not
// by an at-rest cipher.

import 'dart:async';
import 'dart:typed_data';

import 'package:domain_core/domain_core.dart' hide WebSessionKey;
import 'package:drift/drift.dart';

import 'app_database.dart';
import 'web_session_key.dart';

/// The web-side `EncryptedStore`. The constructor takes the
/// `WebSessionKey` holder and a `databaseOpener` that, given the
/// derived key bytes, returns the open `AppDatabase`. The opener
/// isolates the wasm binding so the test surface can substitute a
/// pure-Dart in-memory database.
class WasmEncryptedStore implements EncryptedStore {
  WasmEncryptedStore({
    required WebSessionKey sessionKey,
    required Future<AppDatabase> Function(Uint8List derivedKey)
        databaseOpener,
  })  : _sessionKey = sessionKey,
        _openDatabase = databaseOpener;

  final WebSessionKey _sessionKey;
  final Future<AppDatabase> Function(Uint8List) _openDatabase;
  AppDatabase? _db;

  /// True when the session is unlocked AND the database is open.
  /// The lock screen and the Day Board both read this.
  bool get isOpen => _db != null;

  /// Try to open the wasm database with the derived key. Returns
  /// `true` on success, `false` if the key is wrong (in v1 the only
  /// store is the same drift schema; a wrong passphrase produces a
  /// non-matching key and the store refuses). The lock screen
  /// renders the calm "that passphrase does not open this store"
  /// line on `false`.
  Future<bool> tryOpen() async {
    if (!_sessionKey.isOpen) return false;
    final key = _sessionKey.derivedKey!;
    try {
      _db = await _openDatabase(key);
      return _db != null;
    } on Object {
      _db = null;
      return false;
    }
  }

  /// Lock the session. The database is closed; the next call to
  /// `recordPlate` or `watchRecent` returns
  /// `StoreFailure(encryptedStoreError: WebSessionKeyFailure())`.
  Future<void> lock() async {
    final db = _db;
    _db = null;
    _sessionKey.lock();
    if (db != null) {
      await db.close();
    }
  }

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
    final db = _db;
    if (db == null) {
      return const StoreFailure(encryptedStoreError: WebSessionKeyFailure());
    }
    final loggedAt = loggedAtUtc ?? DateTime.now().toUtc();
    final loggedAtIso = loggedAt.toUtc().toIso8601String();
    try {
      final plateLogId = await db.transaction(() async {
        final plateId = await db.into(db.plateLogTable).insert(
              PlateLogTableCompanion.insert(loggedAtUtc: loggedAtIso),
            );
        for (final entry in entries) {
          await db.into(db.foodEntryTable).insert(
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
    } on Object {
      return const StoreFailure(encryptedStoreError: WebSessionKeyFailure());
    }
  }

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) {
    final db = _db;
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
  Future<void> close() async {
    final db = _db;
    _db = null;
    if (db != null) {
      await db.close();
    }
  }

  Future<PlateLog> _readPlateLog(
    AppDatabase db,
    int plateLogId,
    DateTime loggedAt,
  ) async {
    final entries = await _entriesFor(db, plateLogId);
    return PlateLog(
      id: plateLogId,
      loggedAtUtc: loggedAt,
      entries: entries,
    );
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
