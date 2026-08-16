// CSV exporter tests (Story 4.2 / AD-9 / NFR10).
//
// Pins: the documented header, the empty-history header-only
// shape, the visible-day scope using the local calendar day,
// the week scope using seven local calendar days, and the
// all-history scope returning the full list.

import 'dart:async';
import 'dart:typed_data';

import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

class _FakeStore implements EncryptedStore {
  _FakeStore(this._plates);
  final List<PlateLog> _plates;
  @override
  Future<RecordPlateResult> recordPlate(
      {required List<FoodEntryDraft> entries, DateTime? loggedAtUtc}) async {
    throw UnimplementedError();
  }

  @override
  Stream<List<PlateLog>> watchRecent({DateTime? since}) async* {
    yield List.unmodifiable(_plates);
  }

  @override
  Future<void> close() async {}
}

PlateLog _plate(int id, DateTime loggedAt, List<FoodEntry> entries) {
  return PlateLog(
    id: id,
    loggedAtUtc: loggedAt.toUtc(),
    entries: entries,
  );
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

void main() {
  group('CsvExporter', () {
    test('header is the documented column order', () {
      final csv = serializePlatesToCsv(const <PlateLog>[]);
      expect(csv, startsWith(kCsvHeader));
      expect(csv, endsWith('\n'));
    });

    test('empty history emits a header-only file', () {
      final csv = serializePlatesToCsv(const <PlateLog>[]);
      expect(csv.split('\n').where((l) => l.isNotEmpty).length, 1);
    });

    test('one plate one entry emits one header + one data row', () {
      final plate = _plate(
        1,
        DateTime(2026, 8, 16, 9),
        [_entry(1, 1, 'Oatmeal')],
      );
      final csv = serializePlatesToCsv([plate]);
      final lines = csv.split('\n').where((l) => l.isNotEmpty).toList();
      expect(lines.length, 2);
      expect(lines[0], equals(kCsvHeader));
      expect(lines[1], contains('Oatmeal'));
      expect(lines[1], contains('2026-08-16'));
    });

    test('one plate two entries emits two data rows', () {
      final plate = _plate(
        1,
        DateTime(2026, 8, 16, 9),
        [_entry(1, 1, 'A'), _entry(2, 1, 'B')],
      );
      final csv = serializePlatesToCsv([plate]);
      final lines = csv.split('\n').where((l) => l.isNotEmpty).toList();
      expect(lines.length, 3);
    });

    test('readPlates visibleDay filters to the local day', () async {
      final store = _FakeStore([
        _plate(1, DateTime(2026, 8, 16, 9), [_entry(1, 1, 'A')]),
        _plate(2, DateTime(2026, 8, 17, 9), [_entry(2, 2, 'B')]),
      ]);
      final exp = CsvExporter(store: store);
      final got = await exp.readPlates(
        scope: ExportScope.visibleDay(DateTime(2026, 8, 16)),
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
      final exp = CsvExporter(store: store);
      final got = await exp.readPlates(
        scope: ExportScope.week(DateTime(2026, 8, 11)),
      );
      expect(got.map((p) => p.id), [2, 3]);
    });

    test('readPlates allHistory returns the full list', () async {
      final store = _FakeStore([
        _plate(1, DateTime(2026, 8, 16, 9), [_entry(1, 1, 'A')]),
        _plate(2, DateTime(2026, 8, 17, 9), [_entry(2, 2, 'B')]),
      ]);
      final exp = CsvExporter(store: store);
      final got = await exp.readPlates(
        scope: const ExportScope.allHistory(),
      );
      expect(got.length, 2);
    });

    test('streamPlates emits ExportReady on success', () async {
      final store = _FakeStore([
        _plate(1, DateTime(2026, 8, 16, 9), [_entry(1, 1, 'A')]),
      ]);
      final exp = CsvExporter(store: store);
      final stream = exp.streamPlates(
        format: ExportFormat.csv,
        scope: const ExportScope.allHistory(),
      );
      final r = await stream.first;
      expect(r, isA<ExportReady>());
    });

    test('streamPlates emits ExportFormatFailure on JSON request', () async {
      final store = _FakeStore(const <PlateLog>[]);
      final exp = CsvExporter(store: store);
      final stream = exp.streamPlates(
        format: ExportFormat.json,
        scope: const ExportScope.allHistory(),
      );
      final r = await stream.first;
      expect(r, isA<ExportFormatFailure>());
    });
  });
}

// Touch `Uint8List` so the analyzer is happy when this file is
// imported in isolation.
void _touch() {
  final _ = Uint8List(0);
  _;
}
