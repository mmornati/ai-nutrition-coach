// The v1 coach interaction log (FR5 / FR9 / AD-1 / AD-3).
//
// Every user action against a coach whisper — tapping `[sure]`,
// tapping `[ask later]`, swiping the whisper away, or closing the
// depth panel — is logged locally through `CoachNoteStore.recordInteraction`.
// The log is append-only; nothing in the core mutates or deletes a
// previous interaction row.
//
// `CoachInteraction` is the closed enum the `CoachInteractionLog` value
// type carries. Four members ship in v1 — `sure` (the user wants the
// bounded depth follow-up), `askLater` (defer quietly with no nag),
// `dismiss` (swipe / system gesture — also quiet, no nag), and
// `depthAnswer` (the user closed the depth panel after reading it).
//
// `depthAnswer` does not count toward the engaged-coach-note signal
// (SM-2 / Story 2.3's "Always" list); neither do `askLater` and
// `dismiss`. Only the `postResolve` anchor counts toward the signal —
// the interaction log is purely a local record of what the user did.
//
// Equality on `CoachInteractionLog` is structural: every field
// participates so two logs with identical `(noteId, kind, at)` compare
// equal. `id` is intentionally absent — the local store assigns the
// autoincrement id on insert, and the value type handed across the
// port boundary is the in-memory shape the use-case constructs.
//
// Pure-Dart: no Flutter / drift / dio / mobile_scanner / image_picker
// imports. The AD-1 grep test in
// `packages/domain_core/test/domain_core_test.dart` pins the rule.

/// The four v1 user actions against a coach whisper.
///
/// Declaration order matches the natural interaction flow:
///
///   * [sure]        — the user wants the bounded depth follow-up.
///     `RecordCoachInteraction` appends one `CoachNote` with
///     `anchor: depthFollowUp`.
///   * [askLater]    — defer quietly. No nag, no follow-up note.
///   * [dismiss]     — swipe / system gesture. No nag, no follow-up
///     note. Same quiet path as `askLater`; the distinction is only
///     so the local log records how the user left the whisper.
///   * [depthAnswer] — the user closed the depth panel after reading
///     the bounded follow-up. The depth panel returns to the
///     underlying whisper's `[sure]` / `[ask later]` form.
///
/// `kind.name` is the verbatim string the local store persists; the
/// adapter round-trips it through the typed enum at read time. The
/// v1 set is closed — a future member would force every call site
/// to pattern-match on it, which is the architectural point.
enum CoachInteraction {
  sure,
  askLater,
  dismiss,
  depthAnswer;

  /// The persisted string form (`sure`, `askLater`, `dismiss`,
  /// `depthAnswer`). Matches `CoachInteraction.name` for the v1 set;
  /// kept as a separate getter so a future rename does not silently
  /// break the on-disk column without a migration.
  String get persistedName => name;
}

/// A single logged interaction against a coach whisper (FR9 / AD-3).
///
/// Carries the autoincrement `noteId` of the `CoachNote` the
/// interaction refers to, the `kind` of action, and the UTC instant
/// the action happened. Equality is structural — the value type is
/// the in-memory shape the `RecordCoachInteraction` use-case
/// constructs; the adapter assigns the row id on insert.
class CoachInteractionLog {
  const CoachInteractionLog({
    required this.noteId,
    required this.kind,
    required this.at,
  });

  /// The `CoachNote.id` the interaction refers to. Foreign key at the
  /// database level (`coach_interactions.coach_note_id` →
  /// `coach_note_table.id`) and at the domain level (the use-case
  /// looks the note up before recording the interaction).
  final int noteId;

  /// The user action recorded against the note. Closed enum — see
  /// [CoachInteraction] for the v1 set.
  final CoachInteraction kind;

  /// The UTC moment the interaction happened. Stored as the
  /// authoritative instant; the UI renders local. Mirrors
  /// `PlateLog.loggedAtUtc` and `CoachNote.generatedAt` — never a
  /// local clock.
  final DateTime at;

  CoachInteractionLog copyWith({
    int? noteId,
    CoachInteraction? kind,
    DateTime? at,
  }) {
    return CoachInteractionLog(
      noteId: noteId ?? this.noteId,
      kind: kind ?? this.kind,
      at: at ?? this.at,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! CoachInteractionLog) return false;
    return other.noteId == noteId &&
        other.kind == kind &&
        other.at == at;
  }

  @override
  int get hashCode => Object.hash(noteId, kind, at);

  @override
  String toString() =>
      'CoachInteractionLog(noteId: $noteId, kind: $kind, at: $at)';
}
