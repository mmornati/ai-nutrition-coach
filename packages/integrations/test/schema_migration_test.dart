// Schema migration v3 -> v4 (security review F2 / F6).
//
// A manual fixture: the EXACT v3 schema (captured from the pre-change
// `AppDatabase`, user_version 3) is created with raw SQL and populated the
// way a shipped build would have, then opened by the NEW code. Asserts the
// upgrade is lossless and adds what v4 needs:
//   * `food_entry_table.food_group` (old rows read back as `other`),
//   * `coach_dismissal_table`,
//   * the rest of the data untouched and the database fully usable.
// (drift's SchemaVerifier would need exported schema JSON for every
// version; a literal v3 fixture proves the same thing for the one upgrade
// that exists.)

import 'dart:io';

import 'package:domain_core/domain_core.dart';
import 'package:drift/drift.dart' hide isNull, isNotNull;
import 'package:drift/native.dart';
import 'package:integrations/integrations.dart';
import 'package:integrations/src/store/app_database.dart';
import 'package:integrations/src/store/encrypted_store_adapter.dart';
import 'package:integrations/src/store/store_error_mapper.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite3;
import 'package:test/test.dart';

import '_support/all_plates.dart';

/// The v3 schema, verbatim.
const List<String> _v3Schema = [
  'CREATE TABLE "plate_log_table" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "logged_at_utc" TEXT NOT NULL)',
  'CREATE TABLE "food_entry_table" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "plate_log_id" INTEGER NOT NULL, "database_food_source_ref" TEXT NOT NULL, "database_food_display_name" TEXT NOT NULL, "database_food_source" TEXT NOT NULL, "quantity_low" TEXT NOT NULL, "quantity_high" TEXT NOT NULL, "quantity_unit" TEXT NOT NULL, "quantity_display_label" TEXT NOT NULL)',
  'CREATE TABLE "coach_note_table" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "plate_log_id" INTEGER NOT NULL, "anchor" TEXT NOT NULL, "question_key" TEXT NOT NULL, "note_text" TEXT NOT NULL, "generated_at" TEXT NOT NULL)',
  'CREATE TABLE "coach_interaction_table" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "coach_note_id" INTEGER NOT NULL, "kind" TEXT NOT NULL, "at" TEXT NOT NULL)',
];

void main() {
  // Several databases over the same file are opened ON PURPOSE here (close,
  // reopen after a simulated rollback).
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;

  late Directory tmp;
  late File file;

  setUp(() {
    tmp = Directory.systemTemp.createTempSync('ai_nutrition_coach_migration_');
    file = File('${tmp.path}/v3.sqlite');
    final raw = sqlite3.sqlite3.open(file.path);
    for (final sql in _v3Schema) {
      raw.execute(sql);
    }
    raw.execute(
      "INSERT INTO plate_log_table (id, logged_at_utc) VALUES "
      "(1, '2026-08-15T12:00:00.000Z')",
    );
    // Legacy rows written with MICROSECONDS (27 chars): the v4 step must
    // normalise them to milliseconds so text range compares are exact.
    raw.execute(
      "INSERT INTO plate_log_table (id, logged_at_utc) VALUES "
      "(2, '2026-08-15T12:00:00.123456Z'), "
      "(3, '2026-08-16T00:00:00.000001Z')",
    );
    raw.execute(
      "INSERT INTO food_entry_table (plate_log_id, database_food_source_ref, "
      "database_food_display_name, database_food_source, quantity_low, "
      "quantity_high, quantity_unit, quantity_display_label) VALUES "
      "(1, 'seed:apple', 'Apple', 'off', '1', '2', 'piece', '~1-2 pieces')",
    );
    raw.execute(
      "INSERT INTO coach_note_table (plate_log_id, anchor, question_key, "
      "note_text, generated_at) VALUES "
      "(1, 'postResolve', 'post.resolve.vegLight', 'q', '2026-08-15T12:00:01.000Z')",
    );
    raw.execute(
      "INSERT INTO coach_interaction_table (coach_note_id, kind, at) VALUES "
      "(1, 'askLater', '2026-08-15T12:05:00.000Z')",
    );
    raw.execute('PRAGMA user_version = 3');
    raw.close();
  });

  tearDown(() {
    if (tmp.existsSync()) tmp.deleteSync(recursive: true);
  });

  test('the fixture really is v3 (no food_group column)', () {
    final raw = sqlite3.sqlite3.open(file.path);
    addTearDown(raw.close);
    final cols = raw
        .select('PRAGMA table_info(food_entry_table)')
        .map((r) => r['name'])
        .toList();
    expect(cols, isNot(contains('food_group')));
    expect(raw.select('PRAGMA user_version').first.values.first, 3);
  });

  test(
    'opening with the new code upgrades to v4 and keeps every row',
    () async {
      final db = AppDatabase(NativeDatabase(file));
      addTearDown(db.close);
      expect(db.schemaVersion, 5);

      final store = EncryptedStoreAdapter(database: db);
      final plates = await store.readAll();
      expect(plates, hasLength(3));
      final apple = plates.last.entries.single;
      expect(apple.databaseFood.displayName, 'Apple');
      expect(apple.databaseFood.source, SourceCatalog.off); // untouched
      // Rows written before v4 never stored a group: `other`, honestly.
      expect(apple.databaseFood.foodGroup, FoodGroup.other);
      expect(apple.quantity.low, 1);
      expect(apple.quantity.high, 2);

      // v2 / v3 tables survive.
      final notes = LocalCoachNoteStore(database: db);
      expect((await notes.forPlate(1)).single.text, 'q');
      final interactions = await db.select(db.coachInteractionTable).get();
      expect(interactions.single.kind, 'askLater');

      final version = await db.customSelect('PRAGMA user_version').getSingle();
      expect(version.data.values.first, 5);
    },
  );

  test('after the upgrade the new column and table work', () async {
    final db = AppDatabase(NativeDatabase(file));
    addTearDown(db.close);
    final store = EncryptedStoreAdapter(database: db);
    final notes = LocalCoachNoteStore(database: db);

    await store.recordPlate(
      entries: [
        const FoodEntryDraft(
          databaseFood: DatabaseFood(
            sourceRef: 'seed:egg',
            displayName: 'Egg',
            source: SourceCatalog.seed,
            foodGroup: FoodGroup.protein,
          ),
          quantity: QuantityRange(
            low: 1,
            high: 1,
            unit: 'piece',
            displayLabel: '~1',
          ),
        ),
      ],
    );
    final plates = await store.readAll();
    expect(plates, hasLength(4));
    expect(
      plates.first.entries.single.databaseFood.foodGroup,
      FoodGroup.protein,
    );

    expect(
      await notes.recordDismissal('note:1'),
      isA<CoachInteractionRecorded>(),
    );
    expect(await notes.watchDismissals().first, {'note:1'});
  });

  test('a database created fresh matches the upgraded one', () async {
    final fresh = AppDatabase(NativeDatabase.memory());
    addTearDown(fresh.close);
    final upgraded = AppDatabase(NativeDatabase(file));
    addTearDown(upgraded.close);

    Future<Map<String, List<String>>> shape(AppDatabase d) async {
      final tables = await d
          .customSelect(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .get();
      final indexes = await d
          .customSelect(
            "SELECT name FROM sqlite_master WHERE type='index' "
            "AND name LIKE 'idx_%' ORDER BY name",
          )
          .get();
      return {
        'indexes': [for (final i in indexes) i.read<String>('name')],
        for (final t in tables)
          t.read<String>('name'): [
            for (final c
                in await d
                    .customSelect(
                      'PRAGMA table_info(${t.read<String>('name')})',
                    )
                    .get())
              c.read<String>('name'),
          ]..sort(),
      };
    }

    expect(await shape(upgraded), await shape(fresh));
  });

  test(
    'legacy microsecond timestamps are normalised to milliseconds',
    () async {
      final db = AppDatabase(NativeDatabase(file));
      addTearDown(db.close);
      final rows = await db
          .customSelect(
            'SELECT id, logged_at_utc FROM plate_log_table ORDER BY id',
          )
          .get();
      expect(
        {
          for (final r in rows)
            r.read<int>('id'): r.read<String>('logged_at_utc'),
        },
        {
          1: '2026-08-15T12:00:00.000Z',
          2: '2026-08-15T12:00:00.123Z',
          3: '2026-08-16T00:00:00.000Z',
        },
      );
      // …and the range read now places them exactly: the 00:00:00.000001 row is
      // in the 16th, not the 15th.
      final store = EncryptedStoreAdapter(database: db);
      final day15 =
          await store.readRange(
                from: DateTime.utc(2026, 8, 15),
                to: DateTime.utc(2026, 8, 16),
              )
              as PlatesRead;
      expect(day15.plates.map((p) => p.id), [2, 1]);
      final day16 =
          await store.readRange(
                from: DateTime.utc(2026, 8, 16),
                to: DateTime.utc(2026, 8, 17),
              )
              as PlatesRead;
      expect(day16.plates.map((p) => p.id), [3]);
    },
  );

  test('the v4 step is re-runnable: a rolled-back user_version reopens '
      'cleanly with the data intact', () async {
    // 1. Upgrade to v4 and add data through the new schema.
    var db = AppDatabase(NativeDatabase(file));
    final store = EncryptedStoreAdapter(database: db);
    await store.recordPlate(
      entries: [
        const FoodEntryDraft(
          databaseFood: DatabaseFood(
            sourceRef: 'seed:egg',
            displayName: 'Egg',
            source: SourceCatalog.seed,
            foodGroup: FoodGroup.protein,
          ),
          quantity: QuantityRange(
            low: 1,
            high: 1,
            unit: 'piece',
            displayLabel: '~1',
          ),
        ),
      ],
    );
    await LocalCoachNoteStore(database: db).recordDismissal('note:7');
    expect(await store.readAll(), hasLength(4));
    await db.close();

    // 2. Simulate a restored backup / downgrade: user_version back to 3 while
    //    the v4 column, table and indexes are still there.
    final raw = sqlite3.sqlite3.open(file.path);
    raw.execute('PRAGMA user_version = 3');
    raw.close();

    // 3. Reopen: must NOT fail with "duplicate column name".
    db = AppDatabase(NativeDatabase(file));
    addTearDown(db.close);
    final again = EncryptedStoreAdapter(database: db);
    final plates = await again.readAll();
    expect(plates, hasLength(4));
    expect(
      plates.first.entries.single.databaseFood.foodGroup,
      FoodGroup.protein,
    );
    expect(await LocalCoachNoteStore(database: db).watchDismissals().first, {
      'note:7',
    });
    final version = await db.customSelect('PRAGMA user_version').getSingle();
    expect(version.data.values.first, 5);
  });

  group('newer data than this build (user_version above the schema)', () {
    test('the open is refused with a typed, classifiable error', () async {
      final raw = sqlite3.sqlite3.open(file.path);
      raw.execute('PRAGMA user_version = 99');
      raw.close();
      final db = AppDatabase(NativeDatabase(file));
      addTearDown(db.close);
      Object? error;
      try {
        await db.customSelect('SELECT 1').get();
      } on Object catch (e) {
        error = e;
      }
      expect(error, isNotNull);
      expect(unwrapStoreCause(error!), isA<SchemaTooNewException>());
      expect(classifyWebOpenError(error), WebOpenFailure.newerVersion);
      // Nothing was changed: the version is still the newer one.
      final check = sqlite3.sqlite3.open(file.path);
      addTearDown(check.close);
      expect(check.select('PRAGMA user_version').first.values.first, 99);
    });
  });

  group('v4 -> v5 (the key/value table, ADR-0003)', () {
    /// A genuine v4 database: made by the current code, then user_version
    /// rolled back to 4 and the v5 table dropped.
    Future<void> makeV4() async {
      final db = AppDatabase(NativeDatabase(file));
      await EncryptedStoreAdapter(database: db).readAll(); // force the upgrade
      await db.close();
      final raw = sqlite3.sqlite3.open(file.path);
      raw.execute('DROP TABLE kv_table');
      raw.execute('PRAGMA user_version = 4');
      raw.close();
    }

    test('adds kv_table and keeps every row', () async {
      await makeV4();
      final raw = sqlite3.sqlite3.open(file.path);
      expect(
        raw
            .select("SELECT name FROM sqlite_master WHERE name = 'kv_table'")
            .isEmpty,
        isTrue,
      );
      raw.close();

      final db = AppDatabase(NativeDatabase(file));
      addTearDown(db.close);
      expect(await EncryptedStoreAdapter(database: db).readAll(), hasLength(3));
      final kv = DatabaseKeyValueStore.of(db);
      await kv.write('ai.settings', '{}');
      expect(await kv.read('ai.settings'), '{}');
      final version = await db.customSelect('PRAGMA user_version').getSingle();
      expect(version.data.values.first, 5);
    });

    test('is re-runnable: a rolled-back user_version with the table present '
        'reopens cleanly with its rows', () async {
      var db = AppDatabase(NativeDatabase(file));
      await DatabaseKeyValueStore.of(db).write('export.lastAtUtc', 'x');
      await db.close();
      final raw = sqlite3.sqlite3.open(file.path);
      raw.execute('PRAGMA user_version = 4');
      raw.close();

      db = AppDatabase(NativeDatabase(file));
      addTearDown(db.close);
      expect(await DatabaseKeyValueStore.of(db).read('export.lastAtUtc'), 'x');
      final version = await db.customSelect('PRAGMA user_version').getSingle();
      expect(version.data.values.first, 5);
    });
  });

  group('indexes (EXPLAIN QUERY PLAN)', () {
    Future<List<String>> plan(
      AppDatabase db,
      String sql,
      List<Object?> args,
    ) async {
      final rows = await db
          .customSelect(
            'EXPLAIN QUERY PLAN $sql',
            variables: [for (final a in args) Variable(a)],
          )
          .get();
      return [for (final r in rows) r.read<String>('detail')];
    }

    for (final upgraded in [false, true]) {
      test('the range read SEARCHes plate_log_table by index, never SCANs it '
          '(${upgraded ? 'upgraded from v3' : 'created at v4'})', () async {
        // One database; the spy records the SQL the adapter really sends.
        final statements = <String>[];
        final db = AppDatabase(
          (upgraded ? NativeDatabase(file) : NativeDatabase.memory())
              .interceptWith(_Spy(statements)),
        );
        addTearDown(db.close);
        await EncryptedStoreAdapter(database: db).readRange(
          from: DateTime.utc(2026, 8, 15),
          to: DateTime.utc(2026, 8, 16),
        );
        final select = statements.firstWhere(
          (s) => s.contains('plate_log_table'),
        );
        final details = await plan(db, select, [
          '2026-08-15T00:00:00.000Z',
          '2026-08-16T00:00:00.000Z',
        ]);
        final text = details.join(' | ');
        expect(text, contains('SEARCH plate_log_table'), reason: text);
        expect(text, contains('idx_plate_logged_at'), reason: text);
        expect(text, isNot(contains('SCAN plate_log_table')), reason: text);
        expect(text, contains('idx_entry_plate'), reason: text);
      });
    }

    test('coach notes are looked up by plate via idx_note_plate', () async {
      final db = AppDatabase(NativeDatabase.memory());
      addTearDown(db.close);
      final details = await plan(
        db,
        'SELECT * FROM coach_note_table WHERE plate_log_id = ? ORDER BY id',
        [1],
      );
      expect(details.join(' | '), contains('idx_note_plate'));
    });
  });
}

class _Spy extends QueryInterceptor {
  _Spy(this.statements);
  final List<String> statements;

  @override
  Future<List<Map<String, Object?>>> runSelect(
    QueryExecutor executor,
    String statement,
    List<Object?> args,
  ) {
    statements.add(statement);
    return executor.runSelect(statement, args);
  }
}
