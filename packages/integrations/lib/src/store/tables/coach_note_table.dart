// `CoachNote` row — one per post-resolve whisper (FR4 / FR9 / AD-3).
//
// The table lives on the same encrypted drift store as
// `plate_log_table` and `food_entry_table` (Story 1.2). Story 2.3
// adds a sibling `coach_note_interaction_table` for the answer /
// dismiss / depth interaction log; this table is append-only in v1.
//
// `plateLogId` is an int column that conceptually back-refs to
// `plate_log_table.id`; the use-case (`RecordPlate`) commits the
// plate first, so the back-ref is always satisfied when the note
// row lands. The existing tables in the schema (Story 1.2) ship
// without database-level FK constraints for the same reason — the
// constraint lives at the use-case layer.
//
// Drift derives the SQL table name from the class name
// (`coach_note_table`) and the data class name from the
// `@DataClassName` annotation (`CoachNoteTableData`). The companion
// class name comes from the table name + `Companion`
// (`CoachNoteTableCompanion`). These three names are what the
// manually-written `app_database.g.dart` references.

import 'package:drift/drift.dart';

// `idx_note_plate`: notes are read (and watched) per plate.
@TableIndex(name: 'idx_note_plate', columns: {#plateLogId})
@DataClassName('CoachNoteTableData')
class CoachNoteTable extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// Back-ref to `plate_log_table.id`. The `RecordPlate` use-case
  /// commits the plate before invoking the `CoachNoteGenerator`, so
  /// the back-ref is always satisfied. No DB-level FK constraint
  /// here — same convention as `food_entry_table` (Story 1.2).
  IntColumn get plateLogId => integer()();

  /// Anchor enum, stored as text. Values match `CoachAnchor.name`
  /// (`postResolve`, `openPlate`).
  TextColumn get anchor => text()();

  /// Reviewable key from the localized store
  /// (`packages/integrations/lib/src/l10n/coach_strings.dart`).
  TextColumn get questionKey => text()();

  /// Verbatim localized copy the whisper renders. Column name is
  /// `note_text` (not `text`) because `text()` is the drift
  /// `Table` base-class column-builder method — the SQL column
  /// name collides with the inherited builder.
  TextColumn get noteText => text()();

  /// UTC ISO-8601 — authoritative moment of generation; rendered
  /// local by the UI.
  TextColumn get generatedAt => text()();
}
