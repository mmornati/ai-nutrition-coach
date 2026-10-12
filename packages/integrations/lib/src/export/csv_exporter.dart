// CSV exporter adapter (Story 4.2 / AD-9 / FR-9 / NFR10).
//
// The exporter reads the plates for the requested scope from the
// same `EncryptedStore` the Day Board reads from (AD-3), filters
// by the scope, then emits a single `ExportReady` carrying the
// `PlateLog` list. The destination adapter (`web_export_destination`
// / `mobile_export_destination`) serializes the list to a CSV
// string and writes it to the user-chosen destination.
//
// The exporter is read-only — it never writes to the store. No
// network call. No telemetry. The CSV is a UTF-8 string the
// destination writes verbatim; the header is the documented
// column order; each row is one `FoodEntry` (one plate can emit
// multiple rows).

import 'dart:async';

import 'package:domain_core/domain_core.dart';

/// The CSV header — one column per field, fixed order, no
/// interpolation. Changing the order is a breaking change for
/// downstream consumers; the order is pinned in
/// `csv_exporter_test.dart`.
const String kCsvHeader =
    'id,logged_at_utc,entry_id,database_food_source,'
    'database_food_ref,database_food_display_name,'
    'quantity_low,quantity_high,quantity_unit,'
    'quantity_display_label';

class CsvExporter implements Exporter {
  CsvExporter({required EncryptedStore store}) : _store = store;

  final EncryptedStore _store;

  @override
  Stream<ExportResult> streamPlates({
    required ExportFormat format,
    required ExportScope scope,
  }) async* {
    if (format != ExportFormat.csv) {
      yield const ExportFormatFailure();
      return;
    }
    final plates = await readPlates(scope: scope);
    yield ExportReady(plates);
  }

  @override
  Future<List<PlateLog>> readPlates({required ExportScope scope}) async {
    final all = await _readAll();
    return _filter(all, scope);
  }

  /// Read every plate from the store. The `watchRecent` stream
  /// is the only mutation-source-agnostic surface the store
  /// exposes (AD-3); we take the first emission as the snapshot.
  Future<List<PlateLog>> _readAll() async {
    final stream = _store.watchRecent();
    final subscription = stream.listen((_) {});
    final first = await stream.first;
    await subscription.cancel();
    return first;
  }

  /// Filter the plate list to the requested scope. Visible day
  /// uses the local calendar day; the week uses seven local
  /// calendar days starting at `start` (inclusive); all history
  /// returns the list verbatim.
  List<PlateLog> _filter(List<PlateLog> plates, ExportScope scope) {
    return filterPlates(plates, scope);
  }
}

/// Public so the `JsonExporter` (sibling adapter) can reuse the
/// same scope-resolution logic — the export must always match
/// what's on screen (AD-3 / NFR10).
List<PlateLog> filterPlates(List<PlateLog> plates, ExportScope scope) {
  return scope.when(
    visibleDay: (day) {
      final start = DateTime(day.year, day.month, day.day);
      final end = start.add(const Duration(days: 1));
      return plates.where((p) {
        final local = p.loggedAtUtc.toLocal();
        return !local.isBefore(start) && local.isBefore(end);
      }).toList(growable: false);
    },
    week: (start) {
      final startLocal = DateTime(start.year, start.month, start.day);
      final endLocal = startLocal.add(const Duration(days: 7));
      return plates.where((p) {
        final local = p.loggedAtUtc.toLocal();
        return !local.isBefore(startLocal) && local.isBefore(endLocal);
      }).toList(growable: false);
    },
    allHistory: () => plates,
  );
}

/// Serialize a `PlateLog` list to a CSV string. The header is
/// always emitted; an empty list produces a header-only file
/// (NFR10 / NFR10 / conventions).
String serializePlatesToCsv(List<PlateLog> plates) {
  final buffer = StringBuffer(kCsvHeader)..write('\n');
  for (final plate in plates) {
    for (final entry in plate.entries) {
      buffer
        ..write(plate.id)
        ..write(',')
        ..write(plate.loggedAtUtc.toUtc().toIso8601String())
        ..write(',')
        ..write(entry.id)
        ..write(',')
        ..write(_csvField(entry.databaseFood.source.name))
        ..write(',')
        ..write(_csvField(entry.databaseFood.sourceRef))
        ..write(',')
        ..write(_csvField(entry.databaseFood.displayName))
        ..write(',')
        ..write(_csvField(entry.quantity.low.toString()))
        ..write(',')
        ..write(_csvField(entry.quantity.high.toString()))
        ..write(',')
        ..write(_csvField(entry.quantity.unit))
        ..write(',')
        ..write(_csvField(entry.quantity.displayLabel))
        ..write('\n');
    }
  }
  return buffer.toString();
}

String _csvField(String raw) {
  if (raw.contains(',') || raw.contains('"') || raw.contains('\n')) {
    final escaped = raw.replaceAll('"', '""');
    return '"$escaped"';
  }
  return raw;
}
