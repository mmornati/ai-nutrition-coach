// `LocalCoachNoteStore` — drift-on-sqlite3mc adapter for the
// `CoachNoteStore` port (FR4 / FR5 / FR9 / AD-3).
//
// Writes to the `coach_note_table` (Story 2.2) and
// `coach_interaction_table` (Story 2.3) on the same encrypted drift
// store `EncryptedStoreAdapter` writes to. The AD-3 invariant holds:
// one encrypted store, no second source, no second mutation path.
//
// `append` assigns the autoincrement `id` on insert and returns the
// resolved `CoachNote` (with the real `id`) inside a typed
// `CoachNoteAppended`. Any storage error (including drift's
// `DriftRemoteException` from the background isolate) is mapped by cause
// to a typed `StoreFailure` (`mapStoreError`, D10) — the same
// shape the encrypted store surfaces — so the use-case collapses
// every failure into a typed `NoCoachNoteGenerated` result without
// inspecting the cause.
//
// `forPlate` reads the notes anchored to a given `plateLogId` in
// insertion order (oldest first, matching the `id ASC` sort) so the
// UI renders the whisper deterministically on reload (no random
// ordering — UX-DR10).
//
// `recordInteraction` (Story 2.3) appends a row to the
// `coach_interaction_table` and returns the autoincrement id. The
// FK back-ref to `coach_note_table.id` lives at the use-case layer
// (same convention as the rest of the schema); the adapter catches
// drift errors and returns the typed failure shape so the
// `RecordCoachInteraction` use-case never inspects a thrown
// exception.

import 'dart:async';

import 'package:drift/drift.dart';
import 'package:domain_core/domain_core.dart';
import 'app_database.dart';
import 'store_error_mapper.dart';

class LocalCoachNoteStore implements CoachNoteStore {
  LocalCoachNoteStore({required AppDatabase database}) : _db = database;

  final AppDatabase _db;

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    try {
      final id = await _db
          .into(_db.coachNoteTable)
          .insert(
            CoachNoteTableCompanion.insert(
              plateLogId: note.plateLogId,
              anchor: note.anchor.name,
              questionKey: note.questionKey,
              noteText: note.text,
              generatedAt: note.generatedAt.toUtc().toIso8601String(),
            ),
          );
      return CoachNoteAppended(note.copyWith(id: id));
    } on Exception catch (e) {
      return CoachNoteAppendFailure(mapStoreError(e));
    }
  }

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async {
    final List<CoachNoteTableData> rows;
    try {
      final query = _db.select(_db.coachNoteTable)
        ..where((t) => t.plateLogId.equals(plateLogId))
        ..orderBy([(t) => OrderingTerm.asc(t.id)]);
      rows = await query.get();
    } on Exception {
      // Port contract: never a thrown exception. A whisper that cannot
      // be read is hidden, exactly like the legacy no-note path.
      return const [];
    }
    final notes = <CoachNote>[];
    for (final r in rows) {
      final DateTime generatedAt;
      try {
        generatedAt = DateTime.parse(r.generatedAt).toUtc();
      } on FormatException {
        // Corrupt stored timestamp: skip the row, never poison the read.
        continue;
      }
      notes.add(
        CoachNote(
          id: r.id,
          plateLogId: r.plateLogId,
          anchor: _parseAnchor(r.anchor),
          questionKey: r.questionKey,
          text: r.noteText,
          generatedAt: generatedAt,
        ),
      );
    }
    return notes;
  }

  @override
  Future<CoachInteractionResult> recordInteraction(
    CoachInteractionLog log,
  ) async {
    try {
      final id = await _db
          .into(_db.coachInteractionTable)
          .insert(
            CoachInteractionTableCompanion.insert(
              coachNoteId: log.noteId,
              kind: log.kind.persistedName,
              at: log.at.toUtc().toIso8601String(),
            ),
          );
      return CoachInteractionRecorded(id);
    } on Exception catch (e) {
      return CoachInteractionFailed(mapStoreError(e));
    }
  }
}

CoachAnchor _parseAnchor(String raw) {
  for (final candidate in CoachAnchor.values) {
    if (candidate.name == raw) return candidate;
  }
  // Defensive fallback. The v1 set is three anchors
  // (`postResolve`, `openPlate`, `depthFollowUp`); a future anchor
  // the v1 store does not know about must not crash the read path —
  // return `postResolve` and let the render surface decide whether
  // to display the note.
  return CoachAnchor.postResolve;
}
