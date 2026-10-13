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
// `watchForPlate` (F6) is a drift watch on the same query: it re-emits when a
// note is appended, so a whisper written a moment AFTER the plate commit
// still appears. `recordDismissal` / `watchDismissals` persist the durable
// "quiet" markers (`coach_dismissal_table`, schema v4).
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
    try {
      return _toNotes(await _notesQuery(plateLogId).get());
    } on Exception {
      // Port contract: never a thrown exception. A whisper that cannot
      // be read is hidden, exactly like the legacy no-note path.
      return const [];
    }
  }

  @override
  Stream<List<CoachNote>> watchForPlate(int plateLogId) {
    return _notesQuery(plateLogId)
        .watch()
        .map(_toNotes)
        .transform(
          StreamTransformer<List<CoachNote>, List<CoachNote>>.fromHandlers(
            // A read failure hides the whisper; it never poisons the stream.
            handleError: (error, stackTrace, sink) => sink.add(const []),
          ),
        );
  }

  SimpleSelectStatement<$CoachNoteTableTable, CoachNoteTableData> _notesQuery(
    int plateLogId,
  ) => _db.select(_db.coachNoteTable)
    ..where((t) => t.plateLogId.equals(plateLogId))
    ..orderBy([(t) => OrderingTerm.asc(t.id)]);

  List<CoachNote> _toNotes(List<CoachNoteTableData> rows) {
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
  Future<CoachInteractionResult> recordDismissal(String key) async {
    try {
      final id = await _db
          .into(_db.coachDismissalTable)
          .insert(
            CoachDismissalTableCompanion.insert(
              dismissalKey: key,
              dismissedAtUtc: DateTime.now().toUtc().toIso8601String(),
            ),
            mode: InsertMode.insertOrIgnore,
          );
      await _pruneOldAiNutritionCoachKeys();
      return CoachInteractionRecorded(id);
    } on Exception catch (e) {
      return CoachInteractionFailed(mapStoreError(e));
    }
  }

  /// Open-plate keys are per (day, slot), so they pile up forever although a
  /// day outside the 7-day week strip can never be shown again. Pruned on
  /// every dismissal write (the only place the table grows): keys dated
  /// before today minus 7 days go. (`openPlate:` is 10 characters, so the
  /// ISO date starts at position 11 and compares as text.) Best-effort.
  Future<void> _pruneOldAiNutritionCoachKeys() async {
    try {
      final cutoff = addCalendarDays(DateTime.now(), -7);
      final iso =
          '${cutoff.year.toString().padLeft(4, '0')}-'
          '${cutoff.month.toString().padLeft(2, '0')}-'
          '${cutoff.day.toString().padLeft(2, '0')}';
      await _db.customStatement(
        "DELETE FROM coach_dismissal_table WHERE dismissal_key LIKE "
        "'openPlate:%' AND substr(dismissal_key, 11, 10) < ?",
        [iso],
      );
    } on Exception {
      // Housekeeping only; the dismissal itself was recorded.
    }
  }

  @override
  Stream<Set<String>> watchDismissals() {
    return _db
        .select(_db.coachDismissalTable)
        .watch()
        .map((rows) => {for (final r in rows) r.dismissalKey})
        .transform(
          StreamTransformer<Set<String>, Set<String>>.fromHandlers(
            handleError: (error, stackTrace, sink) => sink.add(<String>{}),
          ),
        );
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

  @override
  Future<DeletePlateResult> deleteForPlate(int plateLogId) async {
    try {
      await _db.transaction(() async {
        final ids = [
          for (final n in await (_db.select(
            _db.coachNoteTable,
          )..where((t) => t.plateLogId.equals(plateLogId))).get())
            n.id,
        ];
        if (ids.isEmpty) return;
        await (_db.delete(
          _db.coachInteractionTable,
        )..where((t) => t.coachNoteId.isIn(ids))).go();
        await (_db.delete(_db.coachDismissalTable)..where(
              (t) => t.dismissalKey.isIn([
                for (final id in ids) coachNoteDismissalKey(id),
              ]),
            ))
            .go();
        await (_db.delete(
          _db.coachNoteTable,
        )..where((t) => t.plateLogId.equals(plateLogId))).go();
      });
      return const PlateDeleted();
    } on Exception catch (e) {
      return PlateDeleteFailed(mapStoreError(e));
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
