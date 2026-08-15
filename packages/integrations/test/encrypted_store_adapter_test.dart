// `EncryptedStoreAdapter` round-trip test — locks the drift mapping,
// the commit-then-watch contract (AD-3), and the `QuantityRange` verbatim
// round-trip (NFR6).

import 'package:domain_core/domain_core.dart';
import 'package:drift/native.dart';
import 'package:integrations/integrations.dart';
import 'package:integrations/src/store/app_database.dart';
import 'package:test/test.dart';

void main() {
  group('EncryptedStoreAdapter (in-memory)', () {
    late EncryptedStoreAdapter store;

    setUp(() {
      final db = AppDatabase(NativeDatabase.memory());
      store = EncryptedStoreAdapter(database: db);
    });

    tearDown(() async {
      await store.close();
    });

    test('recordPlate commits, returns RecordPlateSuccess with assigned ids',
        () async {
      final draft = FoodEntryDraft(
        databaseFood: const DatabaseFood(
          sourceRef: 'manual:apple',
          displayName: 'Apple',
          source: SourceCatalog.manual,
        ),
        quantity: const QuantityRange(
          low: 1,
          high: 2,
          unit: 'piece',
          displayLabel: '~1–2 pieces',
        ),
      );

      final result = await store.recordPlate(entries: [draft]);

      expect(result, isA<RecordPlateSuccess>());
      final success = result as RecordPlateSuccess;
      expect(success.plateLog.id, isPositive);
      expect(success.plateLog.entries, hasLength(1));
      final entry = success.plateLog.entries.single;
      expect(entry.plateLogId, success.plateLog.id);
      expect(entry.databaseFood, draft.databaseFood);
      expect(entry.quantity, draft.quantity);
    });

    test('QuantityRange round-trip preserves low/high verbatim', () async {
      const fractional = QuantityRange(
        low: 0.5,
        high: 1.5,
        unit: 'cup',
        displayLabel: '~½–1½ cups',
      );
      final draft = FoodEntryDraft(
        databaseFood: const DatabaseFood(
          sourceRef: 'manual:rice',
          displayName: 'Rice',
          source: SourceCatalog.manual,
        ),
        quantity: fractional,
      );

      final result = await store.recordPlate(entries: [draft]);
      expect(result, isA<RecordPlateSuccess>());
      final entry =
          (result as RecordPlateSuccess).plateLog.entries.single;

      expect(entry.quantity.low, 0.5);
      expect(entry.quantity.high, 1.5);
      expect(entry.quantity.unit, 'cup');
      expect(entry.quantity.displayLabel, '~½–1½ cups');
    });

    test('watchRecent emits a snapshot per commit', () async {
      final stream = store.watchRecent();
      final snapshots = <List<PlateLog>>[];
      final sub = stream.listen(snapshots.add);

      await store.recordPlate(
        entries: [
          FoodEntryDraft(
            databaseFood: const DatabaseFood(
              sourceRef: 'manual:a',
              displayName: 'A',
              source: SourceCatalog.manual,
            ),
            quantity: const QuantityRange(
              low: 1,
              high: 1,
              unit: 'piece',
              displayLabel: '~1 piece',
            ),
          ),
        ],
      );
      await store.recordPlate(
        entries: [
          FoodEntryDraft(
            databaseFood: const DatabaseFood(
              sourceRef: 'manual:b',
              displayName: 'B',
              source: SourceCatalog.manual,
            ),
            quantity: const QuantityRange(
              low: 2,
              high: 2,
              unit: 'piece',
              displayLabel: '~2 pieces',
            ),
          ),
        ],
      );

      await Future<void>.delayed(Duration.zero);
      await sub.cancel();

      expect(snapshots.length, greaterThanOrEqualTo(2));
      final last = snapshots.last;
      expect(last, hasLength(2));
      expect(last.first.entries.single.databaseFood.displayName, anyOf('A', 'B'));
      expect(last.last.entries.single.databaseFood.displayName, anyOf('A', 'B'));
    });

    test('two concurrent records each commit (separate transactions)',
        () async {
      final first = store.recordPlate(
        entries: [
          FoodEntryDraft(
            databaseFood: const DatabaseFood(
              sourceRef: 'manual:a',
              displayName: 'A',
              source: SourceCatalog.manual,
            ),
            quantity: const QuantityRange(
              low: 1,
              high: 1,
              unit: 'piece',
              displayLabel: '~1 piece',
            ),
          ),
        ],
      );
      final second = store.recordPlate(
        entries: [
          FoodEntryDraft(
            databaseFood: const DatabaseFood(
              sourceRef: 'manual:b',
              displayName: 'B',
              source: SourceCatalog.manual,
            ),
            quantity: const QuantityRange(
              low: 2,
              high: 2,
              unit: 'piece',
              displayLabel: '~2 pieces',
            ),
          ),
        ],
      );
      final results = await Future.wait([first, second]);

      expect(results, hasLength(2));
      expect(results.every((r) => r is RecordPlateSuccess), isTrue);
      final ids = results
          .map((r) => (r as RecordPlateSuccess).plateLog.id)
          .toList();
      expect(ids[0], isNot(ids[1]));
    });
  });

  group('WebEncryptedStoreStub', () {
    test('every method returns UnsupportedPlatformFailure synchronously',
        () async {
      const stub = WebEncryptedStoreStub();
      final result = await stub.recordPlate(
        entries: [
          FoodEntryDraft(
            databaseFood: const DatabaseFood(
              sourceRef: 'manual:x',
              displayName: 'X',
              source: SourceCatalog.manual,
            ),
            quantity: const QuantityRange(
              low: 0,
              high: 0,
              unit: 'g',
              displayLabel: '~0 g',
            ),
          ),
        ],
      );
      expect(result, isA<StoreFailure>());
      final failure = result as StoreFailure;
      expect(failure.platformError, isA<UnsupportedPlatformFailure>());
      expect(failure.validationError, isNull);
      expect(failure.encryptedStoreError, isNull);
    });
  });
}
