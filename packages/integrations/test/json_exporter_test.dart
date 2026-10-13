// JSON exporter tests (Story 4.2 / AD-9 / NFR10).
//
// Pins the documented envelope (`{"plates": [...]}`), the
// empty-history `{"plates": []}` shape, and the field shape
// per plate / entry.

import 'dart:convert';

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

class _FakeStore implements EncryptedStore {
  @override
  Future<DeletePlateResult> deletePlate(int plateLogId) async =>
      const PlateDeleted();

  _FakeStore(this._plates);
  final List<PlateLog> _plates;
  @override
  Future<RecordPlateResult> recordPlate({
    required List<FoodEntryDraft> entries,
    DateTime? loggedAtUtc,
  }) async {
    throw UnimplementedError();
  }

  @override
  Stream<List<PlateLog>> watchRange({
    required DateTime from,
    required DateTime to,
  }) async* {
    yield platesInRange(_plates, from: from, to: to);
  }

  @override
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to}) async =>
      PlatesRead(platesInRange(_plates, from: from, to: to));

  @override
  Future<void> close() async {}
}

PlateLog _plate(int id, DateTime loggedAt, List<FoodEntry> entries) {
  return PlateLog(id: id, loggedAtUtc: loggedAt.toUtc(), entries: entries);
}

FoodEntry _entry(int id, int plateId, String name) {
  return FoodEntry(
    id: id,
    plateLogId: plateId,
    databaseFood: DatabaseFood(
      sourceRef: 'ref-$id',
      displayName: name,
      source: SourceCatalog.manual,
    ),
    quantity: const QuantityRange(
      low: 1,
      high: 2,
      unit: 'fist',
      displayLabel: '1–2 fists',
    ),
  );
}

Future<List<PlateLog>> _plates(Future<ExportResult> pending) async =>
    ((await pending) as ExportReady).plates;

void main() {
  group('JsonExporter', () {
    test('envelope is `{"plates": [...]}`', () {
      final json = serializePlatesToJson(const <PlateLog>[]);
      final decoded = jsonDecode(json) as Map<String, Object?>;
      expect(decoded.keys, ['plates']);
      expect(decoded['plates'], isA<List<dynamic>>());
    });

    test('empty history emits `{"plates": []}`', () {
      final json = serializePlatesToJson(const <PlateLog>[]);
      final decoded = jsonDecode(json) as Map<String, Object?>;
      expect(decoded['plates'], isEmpty);
    });

    test('one plate one entry round-trips', () {
      final plate = _plate(1, DateTime.utc(2026, 8, 16, 9), [
        _entry(1, 1, 'Oatmeal'),
      ]);
      final json = serializePlatesToJson([plate]);
      final decoded = jsonDecode(json) as Map<String, Object?>;
      final plates = decoded['plates'] as List<dynamic>;
      expect(plates.length, 1);
      final p = plates.first as Map<String, Object?>;
      expect(p['id'], 1);
      expect(p['loggedAtUtc'], '2026-08-16T09:00:00.000Z');
      final entries = p['entries'] as List<dynamic>;
      expect(entries.length, 1);
      final e = entries.first as Map<String, Object?>;
      final food = e['databaseFood'] as Map<String, Object?>;
      expect(food['displayName'], 'Oatmeal');
      // F2: the group is exported (default `other` for this fixture).
      expect(food['foodGroup'], 'other');
    });

    test('readPlates visibleDay filters to the local day', () async {
      final store = _FakeStore([
        _plate(1, DateTime(2026, 8, 16, 9), [_entry(1, 1, 'A')]),
        _plate(2, DateTime(2026, 8, 17, 9), [_entry(2, 2, 'B')]),
      ]);
      final exp = JsonExporter(store: store);
      final got = await _plates(
        exp.readPlates(scope: ExportScope.visibleDay(DateTime(2026, 8, 16))),
      );
      expect(got.length, 1);
      expect(got.first.id, 1);
    });

    test('readPlates week filters to seven local days', () async {
      final store = _FakeStore([
        _plate(1, DateTime(2026, 8, 10, 9), [_entry(1, 1, 'Before')]),
        _plate(2, DateTime(2026, 8, 11, 9), [_entry(2, 2, 'Start')]),
        _plate(3, DateTime(2026, 8, 17, 9), [_entry(3, 3, 'End')]),
        _plate(4, DateTime(2026, 8, 18, 9), [_entry(4, 4, 'After')]),
      ]);
      final exp = JsonExporter(store: store);
      final got = await _plates(
        exp.readPlates(scope: ExportScope.week(DateTime(2026, 8, 11))),
      );
      expect(got.map((p) => p.id), [3, 2]); // newest first
    });

    test('readPlates allHistory returns the full list', () async {
      final store = _FakeStore([
        _plate(1, DateTime(2026, 8, 16, 9), [_entry(1, 1, 'A')]),
        _plate(2, DateTime(2026, 8, 17, 9), [_entry(2, 2, 'B')]),
      ]);
      final exp = JsonExporter(store: store);
      final got = await _plates(
        exp.readPlates(scope: const ExportScope.allHistory()),
      );
      expect(got.length, 2);
    });

    test('streamPlates emits ExportFormatFailure on CSV request', () async {
      final store = _FakeStore(const <PlateLog>[]);
      final exp = JsonExporter(store: store);
      final stream = exp.streamPlates(
        format: ExportFormat.csv,
        scope: const ExportScope.allHistory(),
      );
      final r = await stream.first;
      expect(r, isA<ExportFormatFailure>());
    });
  });
}
