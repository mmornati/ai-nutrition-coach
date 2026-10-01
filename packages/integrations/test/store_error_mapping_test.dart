// Store error mapping + corrupt-row resilience (Phase 2A / D10).

import 'dart:async';

import 'package:domain_core/domain_core.dart';
import 'package:drift/native.dart';
import 'package:integrations/integrations.dart';
import 'package:integrations/src/store/app_database.dart';
import 'package:integrations/src/store/encrypted_store_adapter.dart';
import 'package:integrations/src/store/store_error_mapper.dart';
import 'package:sqlite3/common.dart' as sqlite3;
import 'package:test/test.dart';

sqlite3.SqliteException _sqlite(int code) => sqlite3.SqliteException(
  extendedResultCode: code,
  message: 'm',
  explanation: 'e',
  causingStatement: "PRAGMA hexkey = 'SECRET'",
);

void main() {
  group('mapStoreError', () {
    test('NOTADB / AUTH map to SecureKeyFailure', () {
      expect(
        mapStoreError(_sqlite(26)).encryptedStoreError,
        isA<SecureKeyFailure>(),
      );
      expect(
        mapStoreError(_sqlite(23)).encryptedStoreError,
        isA<SecureKeyFailure>(),
      );
    });

    test('other SQLite errors map to StoreOperationFailure, not key', () {
      for (final code in [1, 5, 13, 11, 19]) {
        expect(
          mapStoreError(_sqlite(code)).encryptedStoreError,
          isA<StoreOperationFailure>(),
          reason: 'code $code',
        );
      }
    });

    test('StoreOpenException maps to SecureKeyFailure', () {
      expect(
        mapStoreError(
          const StoreOpenException(StoreOpenFailureReason.missingCipher),
        ).encryptedStoreError,
        isA<SecureKeyFailure>(),
      );
    });

    test('unknown errors map to StoreOperationFailure and carry no text', () {
      final failure = mapStoreError(StateError('disk on fire /secret/path'));
      expect(failure.encryptedStoreError, isA<StoreOperationFailure>());
      expect(failure.toString(), isNot(contains('secret')));
    });
  });

  group('EncryptedStoreAdapter resilience', () {
    late AppDatabase db;
    late List<String> reports;
    late EncryptedStoreAdapter store;

    setUp(() {
      db = AppDatabase(NativeDatabase.memory());
      reports = [];
      store = EncryptedStoreAdapter(
        database: db,
        onCorruptRow: (id, reason) => reports.add('$id:$reason'),
      );
    });
    tearDown(() => store.close());

    Future<int> insertPlate(String loggedAt) => db
        .into(db.plateLogTable)
        .insert(PlateLogTableCompanion.insert(loggedAtUtc: loggedAt));

    Future<void> insertEntry(int plateId, String low, String high) => db
        .into(db.foodEntryTable)
        .insert(
          FoodEntryTableCompanion.insert(
            plateLogId: plateId,
            databaseFoodSourceRef: 'manual:x',
            databaseFoodDisplayName: 'X',
            databaseFoodSource: 'manual',
            quantityLow: low,
            quantityHigh: high,
            quantityUnit: 'piece',
            quantityDisplayLabel: '~1',
          ),
        );

    test(
      'a bad timestamp skips + reports the row; others still emit',
      () async {
        await insertPlate('not-a-date');
        final good = await insertPlate(
          DateTime.utc(2026, 1, 2).toIso8601String(),
        );
        await insertEntry(good, '1', '2');

        final plates = await store.watchRecent().first;
        expect(plates.map((p) => p.id), [good]);
        expect(reports, hasLength(1));
        expect(reports.single, contains('timestamp'));
      },
    );

    test('NaN / Infinity quantities skip the entry, not the stream', () async {
      final plate = await insertPlate(
        DateTime.utc(2026, 1, 2).toIso8601String(),
      );
      await insertEntry(plate, 'NaN', '2');
      await insertEntry(plate, '1', 'Infinity');
      await insertEntry(plate, '0.5', '1.5');

      final plates = await store.watchRecent().first;
      expect(plates.single.entries, hasLength(1));
      expect(plates.single.entries.single.quantity.low, 0.5);
      expect(reports, hasLength(2));
      expect(reports.every((r) => r.contains('non-finite')), isTrue);
    });

    test('an error in the stream surfaces as StoreStreamException', () async {
      await db.customStatement('DROP TABLE plate_log_table');
      await expectLater(
        store.watchRecent(),
        emitsError(
          isA<StoreStreamException>().having(
            (e) => e.failure.encryptedStoreError,
            'failure',
            // Not a key problem: mapped by cause.
            isA<StoreOperationFailure>(),
          ),
        ),
      );
    });

    test('recordPlate on a broken database returns a typed failure', () async {
      await db.customStatement('DROP TABLE plate_log_table');
      final result = await store.recordPlate(
        entries: [
          FoodEntryDraft(
            databaseFood: const DatabaseFood(
              sourceRef: 'manual:x',
              displayName: 'X',
              source: SourceCatalog.manual,
            ),
            quantity: const QuantityRange(
              low: 1,
              high: 1,
              unit: 'piece',
              displayLabel: '~1',
            ),
          ),
        ],
      );
      expect(result, isA<StoreFailure>());
      expect(
        (result as StoreFailure).encryptedStoreError,
        isA<StoreOperationFailure>(),
      );
    });
  });

  group('LocalCoachNoteStore resilience', () {
    test('forPlate skips a corrupt timestamp row, never throws', () async {
      final db = AppDatabase(NativeDatabase.memory());
      addTearDown(db.close);
      final store = LocalCoachNoteStore(database: db);
      await db
          .into(db.coachNoteTable)
          .insert(
            CoachNoteTableCompanion.insert(
              plateLogId: 1,
              anchor: 'postResolve',
              questionKey: 'q',
              noteText: 'bad',
              generatedAt: 'garbage',
            ),
          );
      await db
          .into(db.coachNoteTable)
          .insert(
            CoachNoteTableCompanion.insert(
              plateLogId: 1,
              anchor: 'postResolve',
              questionKey: 'q',
              noteText: 'good',
              generatedAt: DateTime.utc(2026, 1, 1).toIso8601String(),
            ),
          );
      final notes = await store.forPlate(1);
      expect(notes.map((n) => n.text), ['good']);
    });

    test(
      'append / recordInteraction / forPlate on a broken db are typed',
      () async {
        final db = AppDatabase(NativeDatabase.memory());
        addTearDown(db.close);
        final store = LocalCoachNoteStore(database: db);
        await db.customStatement('DROP TABLE coach_note_table');
        await db.customStatement('DROP TABLE coach_interaction_table');
        final appended = await store.append(
          CoachNote(
            id: 0,
            plateLogId: 1,
            anchor: CoachAnchor.postResolve,
            questionKey: 'q',
            text: 't',
            generatedAt: DateTime.utc(2026),
          ),
        );
        expect(appended, isA<CoachNoteAppendFailure>());
        expect(
          await store.recordInteraction(
            CoachInteractionLog(
              noteId: 1,
              kind: CoachInteraction.dismiss,
              at: DateTime.utc(2026),
            ),
          ),
          isA<CoachInteractionFailed>(),
        );
        expect(await store.forPlate(1), isEmpty);
      },
    );
  });
}
