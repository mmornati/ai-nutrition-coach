// JSON exporter adapter (Story 4.2 / AD-9 / FR-9 / NFR10).
//
// The exporter reads the plates for the requested scope from the
// same `EncryptedStore` the Day Board reads from (AD-3), filters
// by the scope, then emits a single `ExportReady` carrying the
// `PlateLog` list. The destination adapter serializes the list to
// a JSON envelope and writes it to the user-chosen destination.
//
// The envelope is a top-level `{"plates": [...]}` so future
// additions (Coach Notes, settings) extend the envelope without
// breaking existing consumers. The plate shape matches the
// `domain_core` `PlateLog` entity so consumers can import the
// same model.

import 'dart:async';
import 'dart:convert';

import 'package:domain_core/domain_core.dart';

import 'csv_exporter.dart' show filterPlates;

class JsonExporter implements Exporter {
  JsonExporter({required EncryptedStore store}) : _store = store;

  final EncryptedStore _store;

  @override
  Stream<ExportResult> streamPlates({
    required ExportFormat format,
    required ExportScope scope,
  }) async* {
    if (format != ExportFormat.json) {
      yield const ExportFormatFailure();
      return;
    }
    final plates = await readPlates(scope: scope);
    yield ExportReady(plates);
  }

  @override
  Future<List<PlateLog>> readPlates({required ExportScope scope}) async {
    // `.first` cancels the subscription itself once the snapshot lands.
    final first = await _store.watchRecent().first;
    return filterPlates(first, scope);
  }
}

/// Serialize a `PlateLog` list to the JSON envelope. The envelope
/// is a top-level object with a `plates` key; each plate is the
/// same shape the core entity carries.
String serializePlatesToJson(List<PlateLog> plates) {
  final encodable = <String, Object?>{
    'plates': plates.map(_plateToJson).toList(growable: false),
  };
  return jsonEncode(encodable);
}

Map<String, Object?> _plateToJson(PlateLog plate) {
  return <String, Object?>{
    'id': plate.id,
    'loggedAtUtc': plate.loggedAtUtc.toUtc().toIso8601String(),
    'entries': plate.entries.map(_entryToJson).toList(growable: false),
  };
}

Map<String, Object?> _entryToJson(FoodEntry entry) {
  return <String, Object?>{
    'id': entry.id,
    'plateLogId': entry.plateLogId,
    'databaseFood': <String, Object?>{
      'source': entry.databaseFood.source.name,
      'sourceRef': entry.databaseFood.sourceRef,
      'displayName': entry.databaseFood.displayName,
    },
    'quantity': <String, Object?>{
      'low': entry.quantity.low,
      'high': entry.quantity.high,
      'unit': entry.quantity.unit,
      'displayLabel': entry.quantity.displayLabel,
    },
  };
}
