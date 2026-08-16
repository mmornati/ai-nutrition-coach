// `CoachInteractionLog` row — append-only record of one user action
// against a coach whisper (FR5 / FR9 / AD-3).
//
// Story 2.3 adds this sibling table to `coach_note_table` on the
// same encrypted drift store (AD-3 invariant — one store, no
// second source). The interaction log is append-only — no UPDATE /
// DELETE on existing rows in v1.
//
// `coachNoteId` is an int column that conceptually back-refs to
// `coach_note_table.id`; the use-case
// (`RecordCoachInteraction.call(note: ...)`) reads the note first so
// the back-ref is always satisfied when the row lands. The existing
// tables in the schema (Stories 1.2 / 2.2) ship without
// database-level FK constraints for the same reason — the
// constraint lives at the use-case layer.
//
// Drift derives the SQL table name from the class name
// (`coach_interaction_table`) and the data class name from the
// `@DataClassName` annotation (`CoachInteractionTableData`). The
// companion class name comes from the table name + `Companion`
// (`CoachInteractionTableCompanion`). These three names are what the
// manually-written `app_database.g.dart` references.

import 'package:drift/drift.dart';

@DataClassName('CoachInteractionTableData')
class CoachInteractionTable extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// Back-ref to `coach_note_table.id`. The `RecordCoachInteraction`
  /// use-case reads the note first, so the back-ref is always
  /// satisfied. No DB-level FK constraint here — same convention as
  /// `coach_note_table` (Story 2.2).
  IntColumn get coachNoteId => integer()();

  /// The user action, stored as the `CoachInteraction.name` string
  /// (`sure`, `askLater`, `dismiss`, `depthAnswer`).
  TextColumn get kind => text()();

  /// UTC ISO-8601 — authoritative moment of the interaction;
  /// rendered local by the UI. Same convention as
  /// `coach_note_table.generatedAt`.
  TextColumn get at => text()();
}
