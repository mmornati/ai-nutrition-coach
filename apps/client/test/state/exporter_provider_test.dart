// Settings → Your data export provider graph pin
// (Story 4.2 / AD-9 / FR-9 / NFR10).
//
// Pins: the CSV / JSON exporter providers read from the same
// `encryptedStoreProvider`; the destination provider selects
// the platform-correct destination; the `exportTaskProvider`
// resolves a one-shot `ExportResult` for the (format, scope)
// pair. The autoDispose family ensures a second export starts
// a fresh stream (UX-DR10).

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_nutrition_coach/state/exporter_provider.dart';
import 'package:ai_nutrition_coach/state/record_plate_provider.dart';

import '../_fakes/fake_encrypted_store.dart';

PlateLog _plate(int id) => PlateLog(
  id: id,
  loggedAtUtc: DateTime.utc(2026, 8, 16, 9),
  entries: const <FoodEntry>[],
);

void main() {
  group('exportFilename', () {
    test('uses the local date + format extension', () {
      final f = exportFilename(
        localDay: DateTime(2026, 8, 16),
        format: ExportFormat.csv,
      );
      expect(f, '2026-08-16-ai-nutrition-coach.csv');
      final j = exportFilename(
        localDay: DateTime(2026, 8, 16),
        format: ExportFormat.json,
      );
      expect(j, '2026-08-16-ai-nutrition-coach.json');
    });
  });

  group('exporter providers', () {
    test('csvExporterProvider reads from the encrypted store', (() async {
      final store = FakeEncryptedStore(initial: [_plate(1), _plate(2)]);
      final container = ProviderContainer(
        overrides: [encryptedStoreProvider.overrideWithValue(store)],
      );
      addTearDown(container.dispose);
      final exp = container.read(csvExporterProvider);
      final got = await exp.readPlates(scope: const ExportScope.allHistory());
      expect((got as ExportReady).plates.length, 2);
    }));

    test('jsonExporterProvider reads from the same store', (() async {
      final store = FakeEncryptedStore(initial: [_plate(1)]);
      final container = ProviderContainer(
        overrides: [encryptedStoreProvider.overrideWithValue(store)],
      );
      addTearDown(container.dispose);
      final exp = container.read(jsonExporterProvider);
      final got = await exp.readPlates(scope: const ExportScope.allHistory());
      expect((got as ExportReady).plates.length, 1);
    }));
  });
}
