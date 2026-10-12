// Deleting a plate is ONE transaction over every table that mentions it
// (privacy audit PV5): entries, plate, coach notes, their interactions and
// their dismissal markers. Asserted at table level (not only through the port)
// on the native adapter and on the web adapter (same `AppDatabase`, real
// sqlite3mc), including the rollback when the last statement fails.

import 'dart:io';

import 'package:domain_core/domain_core.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integrations/integrations.dart';
import 'package:integrations/src/store/app_database.dart';
import 'package:integrations/src/store/encrypted_store_adapter.dart';

import '_support/file_web_backend.dart';

const _food = DatabaseFood(
  sourceRef: 'manual:apple',
  displayName: 'Apple',
  source: SourceCatalog.manual,
  foodGroup: FoodGroup.vegFruit,
);
const _qty = QuantityRange(
  low: 1,
  high: 1,
  unit: 'piece',
  displayLabel: '~1 piece',
);

Future<int> _count(
  AppDatabase db,
  String table, [
  String where = '1=1',
]) async =>
    (await db
            .customSelect('SELECT COUNT(*) AS c FROM $table WHERE $where')
            .getSingle())
        .read<int>('c');

Future<List<int>> _counts(AppDatabase db) async => [
  await _count(db, 'plate_log_table'),
  await _count(db, 'food_entry_table'),
  await _count(db, 'coach_note_table'),
  await _count(db, 'coach_interaction_table'),
  await _count(db, 'coach_dismissal_table'),
];

/// Two plates, each with two entries and a note, an interaction and a
/// dismissal; returns the first plate's id.
Future<int> _seed(EncryptedStore store, CoachNoteStore notes) async {
  final ids = <int>[];
  for (var i = 0; i < 2; i++) {
    final r = await store.recordPlate(
      entries: [
        const FoodEntryDraft(databaseFood: _food, quantity: _qty),
        const FoodEntryDraft(databaseFood: _food, quantity: _qty),
      ],
      loggedAtUtc: DateTime.utc(2026, 8, 16, 12 + i),
    );
    final plate = (r as RecordPlateSuccess).plateLog;
    ids.add(plate.id);
    final note =
        (await notes.append(
                  CoachNote(
                    id: 0,
                    plateLogId: plate.id,
                    anchor: CoachAnchor.postResolve,
                    questionKey: 'k',
                    text: 't',
                    generatedAt: DateTime.utc(2026, 8, 16),
                  ),
                )
                as CoachNoteAppended)
            .note;
    await notes.recordInteraction(
      CoachInteractionLog(
        noteId: note.id,
        kind: CoachInteraction.sure,
        at: DateTime.utc(2026, 8, 16),
      ),
    );
    await notes.recordDismissal(coachNoteDismissalKey(note.id));
  }
  return ids.first;
}

void cascade(
  String name,
  Future<
    ({
      AppDatabase db,
      EncryptedStore store,
      CoachNoteStore notes,
      Future<void> Function() dispose,
    })
  >
  Function()
  create,
) {
  group('delete cascade: $name', () {
    test('removes the plate, its entries, notes, interactions and '
        'dismissals - and only those - in the tables', () async {
      final w = await create();
      addTearDown(w.dispose);
      final first = await _seed(w.store, w.notes);
      expect(await _counts(w.db), [2, 4, 2, 2, 2]);

      // The PORT alone (no coach-store call) already cascades: one tx.
      expect(await w.store.deletePlate(first), isA<PlateDeleted>());

      expect(await _counts(w.db), [1, 2, 1, 1, 1]);
      expect(
        await _count(w.db, 'food_entry_table', 'plate_log_id = $first'),
        0,
      );
      expect(
        await _count(w.db, 'coach_note_table', 'plate_log_id = $first'),
        0,
      );
    });

    test(
      'all or nothing: when the plate row cannot be deleted, the '
      'entries, notes, interactions and dismissals are all still there',
      () async {
        final w = await create();
        addTearDown(w.dispose);
        final first = await _seed(w.store, w.notes);
        final before = await _counts(w.db);
        await w.db.customStatement(
          "CREATE TRIGGER block_plate_delete BEFORE DELETE ON plate_log_table "
          "BEGIN SELECT RAISE(ABORT, 'blocked'); END",
        );

        expect(await w.store.deletePlate(first), isA<PlateDeleteFailed>());

        expect(await _counts(w.db), before, reason: 'rolled back as one unit');
      },
    );
  });
}

void main() {
  cascade('native adapter', () async {
    final db = AppDatabase(NativeDatabase.memory());
    return (
      db: db,
      store: EncryptedStoreAdapter(database: db) as EncryptedStore,
      notes: LocalCoachNoteStore(database: db) as CoachNoteStore,
      dispose: db.close,
    );
  });

  cascade(
    'native adapter in a background isolate (as in production)',
    () async {
      final dir = Directory.systemTemp.createTempSync('openplate_cascade_iso_');
      final db = AppDatabase(
        NativeDatabase.createInBackground(File('${dir.path}/x.sqlite')),
      );
      return (
        db: db,
        store: EncryptedStoreAdapter(database: db) as EncryptedStore,
        notes: LocalCoachNoteStore(database: db) as CoachNoteStore,
        dispose: () async {
          await db.close();
          dir.deleteSync(recursive: true);
        },
      );
    },
  );

  cascade('web adapter (real sqlite3mc, file backend)', () async {
    final dir = Directory.systemTemp.createTempSync('openplate_cascade_');
    final controller = WebStoreController(
      storage: InMemoryWebStoreStorage(),
      backend: FileWebBackend(File('${dir.path}/openplate.db')),
      kdf: const DartPbkdf2Kdf(),
      lock: InMemoryWebStoreLock(),
      normalizePassphrase: (s) => s,
      kdfParams: const WebKdfParams(iterations: 1000),
      minIterations: 1000,
    );
    await controller.initialize();
    expect(
      await controller.createStore('correct horse battery staple'),
      isA<WebUnlocked>(),
    );
    return (
      db: controller.database!,
      store: WasmEncryptedStore(source: controller) as EncryptedStore,
      notes: WasmCoachNoteStore(source: controller) as CoachNoteStore,
      dispose: () async {
        await controller.lock();
        dir.deleteSync(recursive: true);
      },
    );
  });
}
