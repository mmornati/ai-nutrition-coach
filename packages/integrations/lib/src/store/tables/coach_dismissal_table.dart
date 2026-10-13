// `CoachDismissal` row — one durable "quiet" marker (security review F6).
//
// A dismissed whisper (`note:<id>`) or open-plate hint
// (`openPlate:<yyyy-MM-dd>:<slot>`) stays dismissed across restarts. The key
// is the primary key, so recording the same dismissal twice is idempotent.
// No synthetic coach notes are written for hints any more. Schema v4.

import 'package:drift/drift.dart';

@DataClassName('CoachDismissalTableData')
class CoachDismissalTable extends Table {
  /// `coachNoteDismissalKey(id)` / `openPlateDismissalKey(day, slot)`.
  TextColumn get dismissalKey => text()();

  /// UTC ISO-8601 — when the user dismissed it.
  TextColumn get dismissedAtUtc => text()();

  @override
  Set<Column<Object>> get primaryKey => {dismissalKey};
}
