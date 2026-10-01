// Typed results crossing the `CoachNoteStore.recordInteraction` port
// (conventions.md / AD-3 / FR9).
//
// `CoachInteractionResult` is a sealed hierarchy with two variants:
//   * `CoachInteractionRecorded(interactionId)` — the adapter wrote
//     the interaction row. `interactionId` is the autoincrement id
//     the adapter assigned; the UI does not currently render it,
//     but it is available for any future audit / debug surface
//     without forcing a second store read.
//   * `CoachInteractionFailed(cause)`            — the adapter refused
//     the write with a typed `StoreFailure` (drift error, FK
//     violation, secure-key failure). The user action still
//     reflected in the UI (whisper dismisses, depth panel closes) —
//     the use-case collapses the failure to a typed
//     `CoachInteractionResult` so the UI never inspects an
//     exception.
//
// No raw exceptions cross the port boundary. AD-3 holds: the same
// `StoreFailure` the encrypted store surfaces is what the
// `CoachNoteStore` adapter returns on its `recordInteraction` path.
//
// Pure-Dart: no Flutter / drift / dio / mobile_scanner / image_picker
// imports. The AD-1 grep test in
// `packages/domain_core/test/domain_core_test.dart` pins the rule.

import '../value_types/coach_interaction.dart';
import 'store_failure.dart';

export '../value_types/coach_interaction.dart'
    show CoachInteraction, CoachInteractionLog;

/// Result of a `CoachNoteStore.recordInteraction` call. Exactly one
/// of the two variants applies per call.
sealed class CoachInteractionResult {
  const CoachInteractionResult();
}

/// The interaction row was written to the store.
/// `interactionId` carries the autoincrement id the adapter assigned
/// so a caller that needs the real id (audit / debug surface) reads
/// it from this field without a second store read.
class CoachInteractionRecorded extends CoachInteractionResult {
  const CoachInteractionRecorded(this.interactionId);

  /// The autoincrement id the adapter assigned on insert. `0` is
  /// reserved for an in-memory value type the adapter hasn't seen
  /// yet; the adapter overwrites it with the real id inside
  /// `recordInteraction`.
  final int interactionId;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CoachInteractionRecorded &&
          other.interactionId == interactionId);

  @override
  int get hashCode => Object.hash('CoachInteractionRecorded', interactionId);

  @override
  String toString() => 'CoachInteractionRecorded($interactionId)';
}

/// The adapter refused the write with a typed `StoreFailure`. The
/// `cause` is the same `StoreFailure` the encrypted store would
/// have surfaced (FK violation against `coach_note_table.id`,
/// secure-key failure, etc.). The user action still reflects in
/// the UI — the use-case collapses the failure to a typed result
/// so the UI never inspects an exception.
class CoachInteractionFailed extends CoachInteractionResult {
  const CoachInteractionFailed(this.cause);

  final StoreFailure cause;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CoachInteractionFailed && other.cause == cause);

  @override
  int get hashCode => Object.hash('CoachInteractionFailed', cause);

  @override
  String toString() => 'CoachInteractionFailed($cause)';
}

/// Convenience helper — pattern-match the sealed result shape into
/// the recorded / failed outcome the `RecordCoachInteraction`
/// use-case cares about. Kept here (not in the use-case) so the
/// result shape and the helper stay together.
bool isRecorded(CoachInteractionResult result) =>
    result is CoachInteractionRecorded;
