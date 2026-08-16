// `CoachNoteStore` port (AD-1 / AD-3 / FR9).
//
// The single sanctioned seam the `CoachNoteGenerator` use-case writes
// coach notes through. Adapters live in `packages/integrations`:
//   * `LocalCoachNoteStore` — Story 2.2 ships the drift-on-sqlite3mc
//     adapter against the `coach_notes` table on the same encrypted
//     store the `RecordPlate` use-case already commits to (AD-3
//     invariant — one store, no second source).
//
// AD-1: the port lives in `packages/domain_core` — pure Dart, no
// Flutter / drift / dio / mobile_scanner / image_picker imports. The
// AD-1 grep test in `packages/domain_core/test/domain_core_test.dart`
// pins the rule.
//
// AD-3: every coach note is written through this port, never
// directly against the encrypted store. The store-adapter-side FK
// constraint to `plate_log_table.id` keeps referential integrity in
// place at the database layer; the use-case only needs the typed
// result shape.
//
// FR9: every note persists locally in the encrypted store. The port
// is `append`-only — there is no `update` or `delete` method in v1.
// Story 2.3 may add an `interaction` log but Story 2.2 does not.

import '../entities/coach_note.dart';
import '../results/coach_note_failure.dart';

/// The single sanctioned coach-note write/read port (AD-1 / AD-3).
abstract interface class CoachNoteStore {
  /// Append a single `CoachNote` to the store. The adapter assigns
  /// the autoincrement `id` on the row; the returned
  /// `CoachNoteAppended` carries the resolved `note` (with the real
  /// `id`) back to the caller.
  ///
  /// The write is best-effort. If the adapter refuses (drift error,
  /// FK violation, secure-key failure), it returns a typed
  /// `CoachNoteAppendFailure` with the underlying `StoreFailure` as
  /// `cause`. No raw exceptions cross this boundary — the
  /// `CoachNoteGenerator` use-case collapses the failure to a
  /// `NoCoachNoteGenerated` so the UI hides the whisper without
  /// inspecting the cause.
  Future<CoachNoteAppendResult> append(CoachNote note);

  /// Read every `CoachNote` anchored to the given `plateLogId`, in
  /// insertion order. Returns an empty list when no notes exist for
  /// the plate — never a thrown exception. The Day Board calls this
  /// for each committed plate; the empty case is the legacy-data path
  /// (pre-2.2 plates have no note, render without the whisper).
  Future<List<CoachNote>> forPlate(int plateLogId);
}
