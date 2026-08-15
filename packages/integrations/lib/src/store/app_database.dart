// Drift database for the OpenPlate local encrypted store.
//
// Schema (Story 1.2, locked):
//   * `plate_log_table` — one row per logged meal (autoincrement id).
//   * `food_entry_table` — denormalised `DatabaseFood` + `QuantityRange`
//     columns back-referenced to `plate_log_table.id`.
//
// Encryption (AD-8): the underlying `NativeDatabase` is opened with a
// `setup` callback that runs the sqlite3mc key pragma. The key bytes come
// from `SecureKeySource` (Keychain/Keystore under
// `openplate_db_key_v1`); this class is deliberately key-agnostic so the
// adapter wiring stays testable with an in-memory `NativeDatabase`.
//
// Codegen: the `part` directive points at `app_database.g.dart`, which
// is committed (option (a) in the spec). Drift's generated output for
// this two-table schema is fully deterministic — there is no parallel
// build dep at `melos bootstrap` time, and CI does not need to run
// build_runner.

import 'package:drift/drift.dart';

import 'tables/food_entry_table.dart';
import 'tables/plate_log_table.dart';

part 'app_database.g.dart';

@DriftDatabase(
  tables: [
    PlateLogTable,
    FoodEntryTable,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  @override
  int get schemaVersion => 1;
}
