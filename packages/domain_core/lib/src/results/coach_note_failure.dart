// Typed results crossing the `CoachNoteStore` port and the
// `CoachNoteGenerator` use-case (conventions.md / AD-3 / AD-7).
//
// Two sealed result shapes ship here:
//
//  * `CoachNoteAppendResult` — the result of a `CoachNoteStore.append`
//    call. Either the note was written (`CoachNoteAppended`) or the
//    adapter surfaced a typed `StoreFailure` as the cause
//    (`CoachNoteAppendFailure`). No raw exceptions cross the port
//    boundary.
//
//  * `CoachNoteGenerationResult` — the result of a
//    `CoachNoteGenerator.generateFor(plate)` call. Either a note was
//    generated and persisted (`CoachNoteGenerated`) or no note was
//    written for this plate (`NoCoachNoteGenerated`). The latter
//    covers both the defensive "no matching pattern" path and the
//    "coach port collapsed to NoCoachQuestion" path — the UI
//    handles both by hiding the whisper.
//
// Both results are sealed so the call sites can pattern-match without
// a default branch — a new variant added later forces every call site
// to be updated, which is the architectural point.
//
// Pure-Dart: no Flutter / drift / dio / mobile_scanner / image_picker
// imports. The AD-1 grep test in
// `packages/domain_core/test/domain_core_test.dart` pins the rule.

import '../entities/coach_note.dart';
import 'store_failure.dart';

/// Result of a `CoachNoteStore.append` call. Exactly one of the two
/// variants applies per call.
sealed class CoachNoteAppendResult {
  const CoachNoteAppendResult();
}

/// The note was written to the store. `note.id` carries the
/// autoincrement id the adapter assigned — call sites that need the
/// real id (e.g. a follow-up read) read it from this field.
class CoachNoteAppended extends CoachNoteAppendResult {
  const CoachNoteAppended(this.note);

  final CoachNote note;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CoachNoteAppended && other.note == note);

  @override
  int get hashCode => Object.hash('CoachNoteAppended', note);

  @override
  String toString() => 'CoachNoteAppended(${note.id})';
}

/// The adapter refused the write with a typed `StoreFailure`. The
/// plate was already committed; the whisper is best-effort and the
/// UI hides it on this path. The `cause` is the same `StoreFailure`
/// the underlying encrypted store would have surfaced.
class CoachNoteAppendFailure extends CoachNoteAppendResult {
  const CoachNoteAppendFailure(this.cause);

  final StoreFailure cause;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CoachNoteAppendFailure && other.cause == cause);

  @override
  int get hashCode => Object.hash('CoachNoteAppendFailure', cause);

  @override
  String toString() => 'CoachNoteAppendFailure($cause)';
}

/// Result of a `CoachNoteGenerator.generateFor(plate)` call. Exactly
/// one of the two variants applies per call.
sealed class CoachNoteGenerationResult {
  const CoachNoteGenerationResult();
}

/// A `CoachNote` was generated, persisted via the store, and is
/// returned here. The `note` field carries the assigned id; the
/// `reason` field documents the dispatch path that produced it
/// (`matched` when the pattern was resolved, `coachEmpty` when the
/// port returned `NoCoachQuestion`, etc.).
class CoachNoteGenerated extends CoachNoteGenerationResult {
  const CoachNoteGenerated(this.note, {this.reason = 'matched'});

  final CoachNote note;

  /// Free-text tag describing which sub-path produced the note.
  /// Defaults to `matched` — the only path v1 actually exercises.
  /// Future rungs (Epic 3) may use richer tags without changing the
  /// sealed shape.
  final String reason;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CoachNoteGenerated &&
          other.note == note &&
          other.reason == reason);

  @override
  int get hashCode => Object.hash('CoachNoteGenerated', note, reason);

  @override
  String toString() =>
      'CoachNoteGenerated(${note.id}, reason: "$reason")';
}

/// No note was generated. The UI renders nothing (no whisper, no
/// fallback copy, no error UI) — the silent path is the honest
/// answer. `reason` documents why so tests can assert on the
/// specific path:
///   * `emptyPlate`        — defensive: plate has no entries
///                            (validation refusal upstream should
///                            make this unreachable via
///                            `RecordPlate`, but the generator is
///                            defensive).
///   * `unknownPattern`    — the resolved pattern did not match any
///                            `CompositionPattern` entry (defensive;
///                            should be unreachable while the enum is
///                            the single source of truth).
///   * `coachEmpty`        — the active `Coach` port returned
///                            `NoCoachQuestion` for the resolved
///                            `(anchor, pattern)` pair.
class NoCoachNoteGenerated extends CoachNoteGenerationResult {
  const NoCoachNoteGenerated(this.reason);

  /// One of `emptyPlate`, `unknownPattern`, `coachEmpty`. Kept as a
  /// free `String` rather than a closed enum so future rungs (Epic 3)
  /// can ship new reasons without forcing a sealed-shape change
  /// here. The set is exercised by the behavioural test in
  /// `coach_note_generator_test.dart`.
  final String reason;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is NoCoachNoteGenerated && other.reason == reason);

  @override
  int get hashCode => Object.hash('NoCoachNoteGenerated', reason);

  @override
  String toString() => 'NoCoachNoteGenerated(reason: "$reason")';
}
