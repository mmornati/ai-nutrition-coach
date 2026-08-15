// `PlateLog` row — single convergent commit per meal (AD-3).
//
// Drift derives the SQL table name from the class name (`plate_log_table`)
// and the data class name from the `@DataClassName` annotation
// (`PlateLogTableData`). The companion class name comes from the table
// name + `Companion` (`PlateLogTableCompanion`). These three names are
// what the manually-written `app_database.g.dart` references.

import 'package:drift/drift.dart';

@DataClassName('PlateLogTableData')
class PlateLogTable extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// UTC ISO-8601 — the authoritative moment of capture; rendered local
  /// by the UI. Stored as text so SQLite comparisons stay simple.
  TextColumn get loggedAtUtc => text()();
}
