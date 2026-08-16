// `LocalCoachNoteStore` — drift-on-sqlite3mc adapter for the
// `CoachNoteStore` port (FR4 / FR9 / AD-3).
//
// Writes to the `coach_note_table` on the same encrypted drift
// store `EncryptedStoreAdapter` writes to. The AD-3 invariant holds:
// one encrypted store, no second source, no second mutation path.
//
// `append` assigns the autoincrement `id` on insert and returns the
// resolved `CoachNote` (with the real `id`) inside a typed
// `CoachNoteAppended`. Drift `SqliteException` is collapsed to
// `StoreFailure(encryptedStoreError: SecureKeyFailure())` — the same
// shape the encrypted store surfaces — so the use-case collapses
// every failure into a typed `NoCoachNoteGenerated` result without
// inspecting the cause.
//
// `forPlate` reads the notes anchored to a given `plateLogId` in
// insertion order (oldest first, matching the `id ASC` sort) so the
// UI renders the whisper deterministically on reload (no random
// ordering — UX-DR10).

import 'dart:async';

import 'package:drift/drift.dart';
import 'package:domain_core/domain_core.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite3;

import 'app_database.dart';

class LocalCoachNoteStore implements CoachNoteStore {
  LocalCoachNoteStore({required AppDatabase database}) : _db = database;

  final AppDatabase _db;

  @override
  Future<CoachNoteAppendResult> append(CoachNote note) async {
    try {
      final id = await _db.into(_db.coachNoteTable).insert(
            CoachNoteTableCompanion.insert(
              plateLogId: note.plateLogId,
              anchor: note.anchor.name,
              questionKey: note.questionKey,
              noteText: note.text,
              generatedAt: note.generatedAt.toUtc().toIso8601String(),
            ),
          );
      return CoachNoteAppended(note.copyWith(id: id));
    } on sqlite3.SqliteException catch (_) {
      return const CoachNoteAppendFailure(StoreFailure(
        encryptedStoreError: SecureKeyFailure(),
      ));
    }
  }

  @override
  Future<List<CoachNote>> forPlate(int plateLogId) async {
    final query = _db.select(_db.coachNoteTable)
      ..where((t) => t.plateLogId.equals(plateLogId))
      ..orderBy([(t) => OrderingTerm.asc(t.id)]);
    final rows = await query.get();
    return rows
        .map(
          (r) => CoachNote(
            id: r.id,
            plateLogId: r.plateLogId,
            anchor: _parseAnchor(r.anchor),
            questionKey: r.questionKey,
            text: r.noteText,
            generatedAt: DateTime.parse(r.generatedAt).toUtc(),
          ),
        )
        .toList(growable: false);
  }
}

CoachAnchor _parseAnchor(String raw) {
  for (final candidate in CoachAnchor.values) {
    if (candidate.name == raw) return candidate;
  }
  // Defensive fallback. The v1 set is two anchors
  // (`postResolve`, `openPlate`); a future anchor the v1 store
  // does not know about must not crash the read path — return
  // `postResolve` and let the render surface decide whether to
  // display the note.
  return CoachAnchor.postResolve;
}
