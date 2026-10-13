// `CoachNoteStore` port (AD-1 / AD-3 / FR9).
//
// The single sanctioned seam the `CoachNoteGenerator` use-case writes
// coach notes through, and the seam the `RecordCoachInteraction`
// use-case writes the user-action log through (Story 2.3). Adapters
// live in `packages/integrations`:
//   * `LocalCoachNoteStore` — Story 2.2 ships the drift-on-sqlite3mc
//     adapter against the `coach_note_table` on the same encrypted
//     store the `RecordPlate` use-case already commits to (AD-3
//     invariant — one store, no second source). Story 2.3 extends
//     the same adapter with a sibling `coach_interactions` table
//     for the answer / dismiss / depth interaction log.
//
// AD-1: the port lives in `packages/domain_core` — pure Dart, no
// Flutter / drift / dio / mobile_scanner / image_picker imports. The
// AD-1 grep test in `packages/domain_core/test/domain_core_test.dart`
// pins the rule.
//
// AD-3: every coach note + every interaction is written through this
// port, never directly against the encrypted store. The
// store-adapter-side FK constraint from `coach_interactions.coach_note_id`
// to `coach_note_table.id` keeps referential integrity in place at the
// database layer; the use-case only needs the typed result shape.
//
// FR9: every note + every interaction persists locally in the
// encrypted store. The port is `append` / `recordInteraction`-only —
// the only removal is `deleteForPlate` (the single-plate delete cascade, PV5).

import '../entities/coach_note.dart';
import '../results/coach_interaction_failure.dart';
import '../results/coach_note_failure.dart';
import '../results/store_failure.dart' show DeletePlateResult;

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

  /// Watch the notes anchored to [plateLogId], oldest first. Emits the
  /// current list, then a fresh one whenever a note is appended — so a
  /// whisper that is written a moment AFTER the plate commit (the
  /// post-resolve generator) still appears (security review F6: the old
  /// one-shot read cached an empty list). Never throws: a read failure
  /// emits an empty list.
  Stream<List<CoachNote>> watchForPlate(int plateLogId);

  /// Persist a "quiet" marker for [key] (see `coachNoteDismissalKey` / `openPlateDismissalKey`): the
  /// whisper / hint it names stays hidden across restarts. Idempotent.
  /// A failure is a typed `CoachInteractionFailed`; the UI still hides the
  /// whisper for the session.
  Future<CoachInteractionResult> recordDismissal(String key);

  /// Watch the set of dismissed keys. Emits the current set, then a fresh
  /// one on every change. A read failure emits an empty set.
  Stream<Set<String>> watchDismissals();

  /// Append a single `CoachInteractionLog` entry — the local record
  /// of one user action against a coach whisper (FR5 / FR9 / Story
  /// 2.3). The adapter assigns the autoincrement `interactionId` on
  /// insert; the returned `CoachInteractionRecorded` carries the
  /// resolved id back to the caller.
  ///
  /// The write is best-effort. If the adapter refuses (drift error,
  /// FK violation against `coach_note_table.id`, secure-key failure),
  /// it returns a typed `CoachInteractionFailed` with the underlying
  /// `StoreFailure` as `cause`. No raw exceptions cross this boundary
  /// — the `RecordCoachInteraction` use-case collapses the failure
  /// to a typed result so the UI never inspects an exception.
  ///
  /// The store is append-only — there is no `update` or `delete`
  /// method in v1. The use-case that calls this port records the
  /// user action regardless of the write outcome so the UI still
  /// reflects the user's intent (whisper dismisses, depth panel
  /// closes) on a failed write.
  Future<CoachInteractionResult> recordInteraction(CoachInteractionLog log);

  /// Remove everything this store holds about [plateLogId]: its notes, the
  /// interactions logged against those notes, and the dismissal markers of
  /// those notes (`coachNoteDismissalKey`). The cascade of a single-plate
  /// delete (privacy audit PV5). Idempotent; an unknown id is a success.
  /// Never throws.
  Future<DeletePlateResult> deleteForPlate(int plateLogId);
}
