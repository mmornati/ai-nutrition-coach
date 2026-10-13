// The plate-log queries shared by the native and the web `EncryptedStore`
// adapters (they run on the SAME `AppDatabase` schema — AD-3 / NFR2).
//
// One implementation of:
//   * the commit (`record`): a single drift transaction that inserts the
//     `PlateLogTable` row and one `FoodEntryTable` row per draft, including
//     the persisted `food_group` (security review F2);
//   * the range read (`read`) and the range watch (`watch`): ONE join query
//     (plates LEFT JOIN entries) bounded to `[from, to)` on the UTC instant,
//     grouped into `PlateLog`s in Dart — no per-plate follow-up query. The
//     range is served by `idx_plate_logged_at` (and the entries by
//     `idx_entry_plate`), so the cost follows the range, not the history
//     (F8; pinned by an EXPLAIN QUERY PLAN test);
//   * the row -> domain mapping, which never lets a corrupt stored row
//     poison a stream: a plate with an unparseable timestamp and an entry
//     with a non-finite / inverted quantity are skipped and reported
//     through `onCorruptRow` (a short, content-free reason — never values).
//
// Timestamps are stored as UTC ISO-8601 TEXT at MILLISECOND precision
// (`record` truncates), so the fixed-width strings sort exactly like the
// instants they encode and a `[from, to)` text comparison is exact.

import 'dart:async';

import 'package:domain_core/domain_core.dart';
import 'package:drift/drift.dart';

import 'app_database.dart';
import 'store_error_mapper.dart';

/// Reports a stored row that was skipped because it could not be mapped
/// to a domain value. Receives the table-local row id and a short,
/// content-free reason; never the row's values.
typedef CorruptRowReporter = void Function(int rowId, String reason);

class PlateQueries {
  PlateQueries(this._db, {CorruptRowReporter? onCorruptRow})
    : _onCorruptRow = onCorruptRow;

  final AppDatabase _db;
  final CorruptRowReporter? _onCorruptRow;

  /// Commit a plate and its entries in one transaction. Never throws.
  Future<RecordPlateResult> record({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
    final loggedAt = _toMillis(loggedAtUtc ?? DateTime.now());
    final loggedAtIso = loggedAt.toIso8601String();
    try {
      final plateLogId = await _db.transaction(() async {
        final plateId = await _db
            .into(_db.plateLogTable)
            .insert(PlateLogTableCompanion.insert(loggedAtUtc: loggedAtIso));
        for (final entry in entries) {
          await _db
              .into(_db.foodEntryTable)
              .insert(
                FoodEntryTableCompanion.insert(
                  plateLogId: plateId,
                  databaseFoodSourceRef: entry.databaseFood.sourceRef,
                  databaseFoodDisplayName: entry.databaseFood.displayName,
                  databaseFoodSource: entry.databaseFood.source.name,
                  foodGroup: Value(entry.databaseFood.foodGroup.name),
                  quantityLow: entry.quantity.low.toString(),
                  quantityHigh: entry.quantity.high.toString(),
                  quantityUnit: entry.quantity.unit,
                  quantityDisplayLabel: entry.quantity.displayLabel,
                ),
              );
        }
        return plateId;
      });
      final plates = await read(from: loggedAt, to: _afterMillis(loggedAt));
      final committed = switch (plates) {
        PlatesRead(plates: final list) =>
          list.where((p) => p.id == plateLogId).firstOrNull,
        PlatesReadFailed() => null,
      };
      if (committed == null) {
        // Committed, but the read-back failed or the row is unreadable:
        // still report the commit, rebuilt from the drafts.
        return RecordPlateSuccess(_rebuild(plateLogId, loggedAt, entries));
      }
      return RecordPlateSuccess(committed);
    } on Exception catch (e) {
      return mapStoreError(e);
    }
  }

  /// Delete the plate and EVERYTHING attached to it in ONE transaction (PV5):
  /// the coach interactions of its notes, their dismissal markers, the notes,
  /// the food entries and the plate row. Native and web share this code (same
  /// `AppDatabase`), so a failure rolls all of it back. An unknown id deletes
  /// nothing and is still a success. Never throws.
  Future<DeletePlateResult> delete(int plateLogId) async {
    try {
      final notes = _db.coachNoteTable;
      // Set-based sub-selects (nothing is read into Dart): the note ids, and
      // their dismissal keys (`coachNoteDismissalKey`: `note:<id>`).
      final noteIds = _db.selectOnly(notes)
        ..addColumns([notes.id])
        ..where(notes.plateLogId.equals(plateLogId));
      final noteKeys = _db.selectOnly(notes)
        ..addColumns([
          const Constant<String>('note:') + notes.id.cast<String>(),
        ])
        ..where(notes.plateLogId.equals(plateLogId));
      await _db.transaction(() async {
        await _db.batch((b) {
          b.deleteWhere(
            _db.coachInteractionTable,
            (t) => t.coachNoteId.isInQuery(noteIds),
          );
          b.deleteWhere(
            _db.coachDismissalTable,
            (t) => t.dismissalKey.isInQuery(noteKeys),
          );
          b.deleteWhere(notes, (t) => t.plateLogId.equals(plateLogId));
          b.deleteWhere(
            _db.foodEntryTable,
            (t) => t.plateLogId.equals(plateLogId),
          );
          b.deleteWhere(_db.plateLogTable, (t) => t.id.equals(plateLogId));
        });
      });
      return const PlateDeleted();
    } on Exception catch (e) {
      return PlateDeleteFailed(mapStoreError(e));
    }
  }

  /// One-shot read of `[from, to)` (open-ended when a bound is `null`),
  /// newest first. Never throws.
  Future<ReadPlatesResult> read({DateTime? from, DateTime? to}) async {
    try {
      final rows = await _joined(from, to).get();
      return PlatesRead(_group(rows));
    } on Exception catch (e) {
      return PlatesReadFailed(mapStoreError(e));
    }
  }

  /// Watch `[from, to)`, newest first: one full snapshot per change.
  /// Errors ride the error channel as a typed `StoreStreamException`.
  Stream<List<PlateLog>> watch({DateTime? from, DateTime? to}) {
    return _joined(from, to)
        .watch()
        .map(_group)
        .transform(
          StreamTransformer<List<PlateLog>, List<PlateLog>>.fromHandlers(
            handleError: (error, stackTrace, sink) {
              if (error is StoreStreamException || error is! Exception) {
                // Typed already, or a programming Error: pass through.
                sink.addError(error, stackTrace);
              } else {
                sink.addError(
                  StoreStreamException(mapStoreError(error)),
                  stackTrace,
                );
              }
            },
          ),
        );
  }

  JoinedSelectStatement<HasResultSet, dynamic> _joined(
    DateTime? from,
    DateTime? to,
  ) {
    final p = _db.plateLogTable;
    final e = _db.foodEntryTable;
    final query = _db.select(p).join([
      leftOuterJoin(e, e.plateLogId.equalsExp(p.id)),
    ]);
    final bounds = <Expression<bool>>[
      if (from != null)
        p.loggedAtUtc.isBiggerOrEqualValue(from.toUtc().toIso8601String()),
      if (to != null)
        p.loggedAtUtc.isSmallerThanValue(to.toUtc().toIso8601String()),
    ];
    if (bounds.isNotEmpty) {
      query.where(bounds.reduce((a, b) => a & b));
    }
    query.orderBy([
      OrderingTerm.desc(p.loggedAtUtc),
      OrderingTerm.desc(p.id),
      OrderingTerm.asc(e.id),
    ]);
    return query;
  }

  /// Group the joined rows (already ordered plate-newest-first, entry id
  /// ascending) into `PlateLog`s.
  List<PlateLog> _group(List<TypedResult> rows) {
    final plates = <PlateLog>[];
    final entriesByPlate = <int, List<FoodEntry>>{};
    final order = <PlateLogTableData>[];
    for (final row in rows) {
      final plate = row.readTable(_db.plateLogTable);
      final bucket = entriesByPlate[plate.id];
      if (bucket == null) {
        entriesByPlate[plate.id] = <FoodEntry>[];
        order.add(plate);
      }
      final entryRow = row.readTableOrNull(_db.foodEntryTable);
      if (entryRow != null) {
        final entry = _toEntry(entryRow);
        if (entry != null) entriesByPlate[plate.id]!.add(entry);
      }
    }
    for (final row in order) {
      final DateTime loggedAt;
      try {
        loggedAt = DateTime.parse(row.loggedAtUtc).toUtc();
      } on FormatException {
        _onCorruptRow?.call(row.id, 'plate: unparseable timestamp');
        continue;
      }
      plates.add(
        PlateLog(
          id: row.id,
          loggedAtUtc: loggedAt,
          entries: entriesByPlate[row.id]!,
        ),
      );
    }
    return plates;
  }

  FoodEntry? _toEntry(FoodEntryTableData r) {
    final low = _parseFinite(r.quantityLow);
    final high = _parseFinite(r.quantityHigh);
    if (low == null || high == null || !QuantityRange.isValidRange(low, high)) {
      _onCorruptRow?.call(r.id, 'entry: invalid quantity');
      return null;
    }
    return FoodEntry(
      id: r.id,
      plateLogId: r.plateLogId,
      databaseFood: DatabaseFood(
        sourceRef: r.databaseFoodSourceRef,
        displayName: r.databaseFoodDisplayName,
        source: _parseSource(r.databaseFoodSource),
        foodGroup: FoodGroup.tryParse(r.foodGroup) ?? FoodGroup.other,
      ),
      quantity: QuantityRange(
        low: low,
        high: high,
        unit: r.quantityUnit,
        displayLabel: r.quantityDisplayLabel,
      ),
    );
  }

  PlateLog _rebuild(int plateId, DateTime loggedAt, List<FoodEntryDraft> d) =>
      PlateLog(
        id: plateId,
        loggedAtUtc: loggedAt,
        entries: [
          for (var i = 0; i < d.length; i++)
            FoodEntry(
              id: 0,
              plateLogId: plateId,
              databaseFood: d[i].databaseFood,
              quantity: d[i].quantity,
            ),
        ],
      );
}

/// Truncate to millisecond precision, UTC.
DateTime _toMillis(DateTime t) =>
    DateTime.fromMillisecondsSinceEpoch(t.millisecondsSinceEpoch, isUtc: true);

DateTime _afterMillis(DateTime t) => t.add(const Duration(milliseconds: 1));

/// Parse a stored quantity; `null` for anything that is not a finite
/// number (`NaN`, `Infinity`, garbage) so a corrupt row is skipped
/// rather than surfacing a non-finite value to the UI.
num? _parseFinite(String raw) {
  final value = num.tryParse(raw);
  if (value == null || (value is double && !value.isFinite)) return null;
  return value;
}

SourceCatalog _parseSource(String raw) {
  for (final candidate in SourceCatalog.values) {
    if (candidate.name == raw) return candidate;
  }
  return SourceCatalog.manual;
}
