// Drift database for the OpenPlate local encrypted store.
//
// Schema:
//   * `plate_log_table`             — one row per logged meal
//     (Story 1.2).
//   * `food_entry_table`            — denormalised `DatabaseFood` +
//     `QuantityRange` columns back-referenced to
//     `plate_log_table.id` (Story 1.2).
//   * `coach_note_table`            — one row per post-resolve coach
//     note (Story 2.2). FK back-ref to `plate_log_table.id` at the
//     use-case layer (no DB-level FK constraint — matches the
//     `food_entry_table` convention).
//   * `coach_interaction_table`     — append-only record of one
//     user action against a coach whisper (Story 2.3). FK
//     back-ref to `coach_note_table.id` at the use-case layer
//     (same convention as the rest of the schema).
//
// Encryption (AD-8): the underlying `NativeDatabase` is opened with a
// `setup` callback that runs the sqlite3mc key pragma. The key bytes come
// from `SecureKeySource` (Keychain/Keystore under
// `openplate_db_key_v1`); this class is deliberately key-agnostic so the
// adapter wiring stays testable with an in-memory `NativeDatabase`.
//
// Codegen: the `part` directive points at `app_database.g.dart`, which
// is committed (option (a) in the spec). Drift's generated output for
// this four-table schema is fully deterministic — there is no
// parallel build dep at `melos bootstrap` time, and CI does not need
// to run build_runner. Story 2.3 extends the committed generated
// file by hand to mirror the existing tables; reviewers should
// re-run `dart run build_runner build --delete-conflicting-outputs`
// against the live drift codegen to confirm byte-for-byte
// equivalence.

import 'package:drift/drift.dart';

import 'tables/coach_interaction_table.dart';
import 'tables/coach_note_table.dart';
import 'tables/food_entry_table.dart';
import 'tables/plate_log_table.dart';

part 'app_database.g.dart';

@DriftDatabase(
  tables: [
    PlateLogTable,
    FoodEntryTable,
    CoachNoteTable,
    CoachInteractionTable,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  @override
  int get schemaVersion => 3;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            await m.createTable(coachNoteTable);
          }
          if (from < 3) {
            await m.createTable(coachInteractionTable);
          }
        },
      );
}
