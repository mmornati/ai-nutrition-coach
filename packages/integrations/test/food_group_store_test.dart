// F2 / F8 against the REAL store adapter (drift on SQLite, no fakes):
//   * `foodGroup` is persisted and survives a re-read, in the one-shot read,
//     the watch, and the exporters;
//   * the range read is `[from, to)`, newest first, ONE select regardless of
//     the number of plates (no N+1);
//   * a watch re-emits on commit and respects its range;
//   * the encrypted file path (`createStores`) round-trips the group too.

import 'dart:io';

import 'package:domain_core/domain_core.dart';
import 'package:drift/drift.dart' hide isNull;
import 'package:drift/native.dart';
import 'package:integrations/integrations.dart';
import 'package:integrations/src/store/app_database.dart';
import 'package:integrations/src/store/encrypted_store_adapter.dart';
import 'package:test/test.dart';

import '_support/all_plates.dart';

class _CountingInterceptor extends QueryInterceptor {
  int selects = 0;

  @override
  Future<List<Map<String, Object?>>> runSelect(
    QueryExecutor executor,
    String statement,
    List<Object?> args,
  ) {
    selects++;
    return executor.runSelect(statement, args);
  }
}

FoodEntryDraft _draft(
  String name,
  FoodGroup group, {
  SourceCatalog source = SourceCatalog.manual,
}) => FoodEntryDraft(
  databaseFood: DatabaseFood(
    sourceRef: 'ref:${name.toLowerCase()}',
    displayName: name,
    source: source,
    foodGroup: group,
  ),
  quantity: const QuantityRange(
    low: 0.5,
    high: 1.5,
    unit: 'cup',
    displayLabel: '~1 cup',
  ),
);

void main() {
  late AppDatabase db;
  late EncryptedStoreAdapter store;
  late _CountingInterceptor counter;

  setUp(() {
    counter = _CountingInterceptor();
    db = AppDatabase(NativeDatabase.memory().interceptWith(counter));
    store = EncryptedStoreAdapter(database: db);
  });

  tearDown(() async {
    await db.close();
  });

  group('F2: foodGroup is persisted', () {
    test('every group, and the seed source, round-trip', () async {
      final drafts = [
        _draft('Apple', FoodGroup.vegFruit, source: SourceCatalog.seed),
        _draft('Egg', FoodGroup.protein),
        _draft('Rice', FoodGroup.starch),
        _draft('Milk', FoodGroup.dairy),
        _draft('Oil', FoodGroup.other),
      ];
      final recorded = await store.recordPlate(entries: drafts);
      final committed = (recorded as RecordPlateSuccess).plateLog;
      // The commit result already carries the groups…
      expect(committed.entries.map((e) => e.databaseFood.foodGroup), [
        FoodGroup.vegFruit,
        FoodGroup.protein,
        FoodGroup.starch,
        FoodGroup.dairy,
        FoodGroup.other,
      ]);
      // …and so does a later, independent read (the old code returned
      // `other` for all of them here).
      final reread = (await store.readAll()).single;
      expect(reread, committed);
      expect(reread.entries.first.databaseFood.source, SourceCatalog.seed);
      expect(reread.entries.map((e) => e.databaseFood.foodGroup), [
        FoodGroup.vegFruit,
        FoodGroup.protein,
        FoodGroup.starch,
        FoodGroup.dairy,
        FoodGroup.other,
      ]);
    });

    test('the watch stream carries the group', () async {
      await store.recordPlate(entries: [_draft('Egg', FoodGroup.protein)]);
      final plates = await store.watchAll().first;
      expect(
        plates.single.entries.single.databaseFood.foodGroup,
        FoodGroup.protein,
      );
    });

    test('an unknown stored group reads back as other, not a crash', () async {
      await store.recordPlate(entries: [_draft('Egg', FoodGroup.protein)]);
      await db.customStatement(
        "UPDATE food_entry_table SET food_group='bogus'",
      );
      expect(
        (await store.readAll()).single.entries.single.databaseFood.foodGroup,
        FoodGroup.other,
      );
    });

    test('the exporters carry the group from the real store', () async {
      await store.recordPlate(entries: [_draft('Egg', FoodGroup.protein)]);
      final ready =
          await CsvExporter(
                store: store,
              ).readPlates(scope: const ExportScope.allHistory())
              as ExportReady;
      expect(serializePlatesToCsv(ready.plates), contains(',protein\n'));
      expect(
        serializePlatesToJson(ready.plates),
        contains('"foodGroup":"protein"'),
      );
    });

    test('a plate whose food is `other` yields a coach note only for known '
        'groups once re-read (the F2 symptom)', () async {
      final notes = _CaptureNotes();
      final generator = CoachNoteGenerator(
        coach: const TemplateCoach(),
        store: notes,
      );
      await store.recordPlate(entries: [_draft('Rice', FoodGroup.starch)]);
      // Re-read from disk and generate on the RE-READ plate: with the old
      // schema every group was `other`, the pattern was unresolvable and no
      // note was ever produced.
      final reread = (await store.readAll()).single;
      final result = await generator.generateFor(reread);
      expect(result, isA<CoachNoteGenerated>());
    });
  });

  group('F8: range read / watch', () {
    Future<void> logAt(DateTime utc, String name) => store.recordPlate(
      entries: [_draft(name, FoodGroup.other)],
      loggedAtUtc: utc,
    );

    test('[from, to) is half-open and newest first', () async {
      await logAt(DateTime.utc(2026, 8, 14, 23, 59, 59, 999), 'before');
      await logAt(DateTime.utc(2026, 8, 15), 'start');
      await logAt(DateTime.utc(2026, 8, 15, 12), 'mid');
      await logAt(DateTime.utc(2026, 8, 16), 'end');
      final result =
          await store.readRange(
                from: DateTime.utc(2026, 8, 15),
                to: DateTime.utc(2026, 8, 16),
              )
              as PlatesRead;
      expect(
        result.plates.map((p) => p.entries.single.databaseFood.displayName),
        ['mid', 'start'],
      );
    });

    test('a plate logged in the first microseconds of a boundary is placed '
        'correctly (timestamps are stored at millisecond precision)', () async {
      await logAt(DateTime.utc(2026, 8, 16, 0, 0, 0, 0, 1), 'just after');
      final before =
          await store.readRange(
                from: DateTime.utc(2026, 8, 15),
                to: DateTime.utc(2026, 8, 16),
              )
              as PlatesRead;
      expect(before.plates, isEmpty);
      final after =
          await store.readRange(
                from: DateTime.utc(2026, 8, 16),
                to: DateTime.utc(2026, 8, 17),
              )
              as PlatesRead;
      expect(after.plates, hasLength(1));
    });

    test('ONE select, however many plates (no N+1)', () async {
      for (var i = 0; i < 6; i++) {
        await logAt(DateTime.utc(2026, 8, 15, i), 'p$i');
      }
      counter.selects = 0;
      final result = await store.readRange() as PlatesRead;
      expect(result.plates, hasLength(6));
      expect(
        result.plates.every((p) => p.entries.length == 1),
        isTrue,
        reason: 'entries come with the plates',
      );
      expect(counter.selects, 1);
    });

    test('a plate without entries is still returned by the join', () async {
      final id = await db
          .into(db.plateLogTable)
          .insert(
            PlateLogTableCompanion.insert(
              loggedAtUtc: DateTime.utc(2026, 8, 15, 8).toIso8601String(),
            ),
          );
      final plates = await store.readAll();
      expect(plates.single.id, id);
      expect(plates.single.entries, isEmpty);
    });

    test('watchRange re-emits on commit and only inside its range', () async {
      final snapshots = <List<String>>[];
      final sub = store
          .watchRange(
            from: DateTime.utc(2026, 8, 15),
            to: DateTime.utc(2026, 8, 16),
          )
          .listen(
            (plates) => snapshots.add([
              for (final p in plates) p.entries.single.databaseFood.displayName,
            ]),
          );
      addTearDown(sub.cancel);
      await Future<void>.delayed(const Duration(milliseconds: 50));
      await logAt(DateTime.utc(2026, 8, 15, 9), 'in');
      await Future<void>.delayed(const Duration(milliseconds: 50));
      await logAt(DateTime.utc(2026, 8, 20, 9), 'out');
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(snapshots.first, isEmpty);
      expect(snapshots.last, ['in']);
      expect(snapshots.any((s) => s.contains('out')), isFalse);
    });

    test(
      'recordPlate returns the committed plate with millisecond time',
      () async {
        final at = DateTime.utc(2026, 8, 15, 9, 30, 0, 123, 456);
        final committed =
            (await store.recordPlate(
                      entries: [_draft('A', FoodGroup.other)],
                      loggedAtUtc: at,
                    )
                    as RecordPlateSuccess)
                .plateLog;
        expect(committed.loggedAtUtc, DateTime.utc(2026, 8, 15, 9, 30, 0, 123));
      },
    );
  });

  group('through the real encrypted factory (sqlite3mc file)', () {
    test('foodGroup survives close + reopen with the same key', () async {
      final tmp = Directory.systemTemp.createTempSync('openplate_fg_');
      addTearDown(() => tmp.deleteSync(recursive: true));
      final keys = InMemoryKeySource();
      final path = '${tmp.path}/$kDatabaseFileName';
      Future<StoreBundle> open() => createStores(
        overrides: StoreOpenOverrides(databaseFilePath: path, keySource: keys),
      );

      final first = await open();
      expect(first.startupFailure, isNull);
      await first.encryptedStore.recordPlate(
        entries: [_draft('Yogurt', FoodGroup.dairy)],
      );
      await first.closeDatabase!();

      final second = await open();
      final plates = await second.encryptedStore.readAll();
      expect(
        plates.single.entries.single.databaseFood.foodGroup,
        FoodGroup.dairy,
      );
      await second.closeDatabase!();
    });
  });
}

class _CaptureNotes implements CoachNoteStore {
  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async =>
      CoachNoteAppended(note.copyWith(id: 1));

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async => const [];

  @override
  Stream<List<CoachNote>> watchForPlate(int plateLogId) =>
      const Stream<List<CoachNote>>.empty();

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async => const CoachInteractionRecorded(1);

  @override
  Future<CoachInteractionResult> recordDismissal(String key) async =>
      const CoachInteractionRecorded(1);

  @override
  Stream<Set<String>> watchDismissals() => const Stream<Set<String>>.empty();
}
