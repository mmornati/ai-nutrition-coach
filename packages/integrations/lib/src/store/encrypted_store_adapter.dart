// `EncryptedStore` mobile implementation — drift on sqlite3mc with
// ChaCha20-Poly1305 at rest (AD-8).
//
// The adapter owns:
//   * the drift `AppDatabase`,
//   * the row → domain entity mapping (`_toPlateLog`, `_toFoodEntry`),
//   * the boundary that converts drift / SQLite / isolate errors to
//     typed `StoreFailure` values (`mapStoreError`, D10) so the port
//     never throws.
//
// `recordPlate` runs a single drift transaction that inserts the parent
// `PlateLogTable` row, then each `FoodEntryTable` row with the assigned
// `plateLogId`. `watchRecent` exposes a query stream — every commit
// triggers a fresh emit (drift's `Stream` is the underlying mechanism
// behind AD-3's "derived view" rule). Errors on that stream are mapped
// to a typed `StoreStreamException`; a stored row that cannot be mapped
// (bad date, non-finite quantity, ...) is skipped and reported through
// `onCorruptRow` so it can never poison the stream.
//
// Encryption (AD-8): the key is attached by the shared synchronous
// `attachKeyAndVerify` (`sqlite_key_attach.dart`), reached through
// `openEncryptedStore` (`native_database_opener.dart`). This class no
// longer contains any keying code.

import 'dart:async';

import 'package:drift/drift.dart';
import 'package:domain_core/domain_core.dart';

import 'app_database.dart';
import 'store_error_mapper.dart';

/// Reports a stored row that was skipped because it could not be mapped
/// to a domain value. Receives the table-local row id and a short,
/// content-free reason; never the row's values.
typedef CorruptRowReporter = void Function(int rowId, String reason);

class EncryptedStoreAdapter implements EncryptedStore {
  EncryptedStoreAdapter({
    required AppDatabase database,
    CorruptRowReporter? onCorruptRow,
  }) : _db = database,
       _onCorruptRow = onCorruptRow;

  /// Tests call this directly with `AppDatabase(NativeDatabase.memory())`;
  /// production builds the database through `openEncryptedStore`
  /// (`native_database_opener.dart`), the single keyed open path.
  final AppDatabase _db;
  final CorruptRowReporter? _onCorruptRow;

  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
    final loggedAt = loggedAtUtc ?? DateTime.now().toUtc();
    final loggedAtIso = loggedAt.toUtc().toIso8601String();
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
    } on Exception catch (e) {
      return mapStoreError(e);
    }
  }

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) {
    final query = _db.select(_db.plateLogTable)
      ..orderBy([(t) => OrderingTerm.desc(t.loggedAtUtc)]);
    if (since != null) {
      query.where(
        (t) => t.loggedAtUtc.isBiggerThanValue(since.toUtc().toIso8601String()),
      );
    }
    return query
        .watch()
        .asyncMap((rows) async {
          final plates = <PlateLog>[];
          for (final row in rows) {
            final DateTime loggedAt;
            try {
              loggedAt = DateTime.parse(row.loggedAtUtc).toUtc();
            } on FormatException {
              _onCorruptRow?.call(row.id, 'plate: unparseable timestamp');
              continue;
            }
            final entries = await _entriesFor(row.id);
            plates.add(
              PlateLog(id: row.id, loggedAtUtc: loggedAt, entries: entries),
            );
          }
          return plates;
        })
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

  @override
  Future<void> close() => _db.close();

  Future<PlateLog> _readPlateLog(int plateLogId, DateTime loggedAt) async {
    final entries = await _entriesFor(plateLogId);
    return PlateLog(id: plateLogId, loggedAtUtc: loggedAt, entries: entries);
  }

  Future<List<FoodEntry>> _entriesFor(int plateLogId) async {
    final query = _db.select(_db.foodEntryTable)
      ..where((t) => t.plateLogId.equals(plateLogId))
      ..orderBy([(t) => OrderingTerm.asc(t.id)]);
    final rows = await query.get();
    final entries = <FoodEntry>[];
    for (final r in rows) {
      final low = _parseFinite(r.quantityLow);
      final high = _parseFinite(r.quantityHigh);
      if (low == null || high == null) {
        _onCorruptRow?.call(r.id, 'entry: non-finite quantity');
        continue;
      }
      entries.add(
        FoodEntry(
          id: r.id,
          plateLogId: r.plateLogId,
          databaseFood: DatabaseFood(
            sourceRef: r.databaseFoodSourceRef,
            displayName: r.databaseFoodDisplayName,
            source: _parseSource(r.databaseFoodSource),
          ),
          quantity: QuantityRange(
            low: low,
            high: high,
            unit: r.quantityUnit,
            displayLabel: r.quantityDisplayLabel,
          ),
        ),
      );
    }
    return entries;
  }
}

String _formatNum(num n) => n.toString();

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
