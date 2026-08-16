// `RecordCoachInteraction` use-case (FR5 / AD-3 / AD-5 / NFR3).
//
// The convergent write path for one user action against a coach
// whisper — tapping `[sure]`, tapping `[ask later]`, swiping the
// whisper away (`dismiss`), or closing the depth panel
// (`depthAnswer`). Every path writes the interaction through
// `CoachNoteStore.recordInteraction` so the local log is the
// authoritative record (AD-3 / FR9).
//
// `[sure]` is the only path that also produces a bounded depth
// follow-up: the use-case asks the active `Coach` port for the
// `(depthFollowUp, pattern)` question, appends ONE bounded
// `CoachNote` with `anchor: depthFollowUp` through the store, and
// then records the `sure` interaction. The second tap on the same
// whisper is a no-op — the use-case only appends a follow-up when
// one does not already exist for the post-resolve note.
//
// `[askLater]` and `[dismiss]` record the interaction only — no
// follow-up note, no nag, no score, no streak. The depth panel
// `[close]` records `depthAnswer`; the depth panel disappears; the
// underlying whisper returns to its `[sure]` / `[ask later]` form.
//
// AD-5: the use-case never branches on which coach rung is active.
// It only inspects whether `questionFor` returned a `CoachFound` and
// pattern-matches the sealed `CoachQuestionResult` shape.
//
// Best-effort (calm degrade): the user action is logged locally
// regardless of any store write outcome so the UI always reflects
// the user's intent. A failed store write collapses to a typed
// `CoachInteractionResult` — never a thrown exception.
//
// Pure-Dart: no Flutter / drift / dio / mobile_scanner / image_picker
// imports. The AD-1 grep test in
// `packages/domain_core/test/domain_core_test.dart` pins the rule.

import '../entities/coach_note.dart';
import '../ports/coach.dart';
import '../ports/coach_note_store.dart';
import '../results/coach_interaction_failure.dart';
import '../results/coach_note_failure.dart';
import '../results/coach_question_result.dart';
import '../results/store_failure.dart';
import '../value_types/coach_interaction.dart';
import '../value_types/composition_pattern.dart';

/// The convergent result of one `RecordCoachInteraction.call(...)`
/// — the view the depth follow-up `FutureProvider.family` reads on
/// the UI side. Exactly one of the four variants applies per call.
///
/// `recordInteractionOutcome` carries the typed
/// `CoachInteractionResult` the store returned so the use-case can
/// be tested at the result boundary without inspecting the cause.
/// `followedUpNote` is the new `CoachNote` the use-case appended on
/// the `sure` path; `null` on every other path (no follow-up) and on
/// the idempotent second tap (the follow-up already exists).
sealed class RecordCoachInteractionResult {
  const RecordCoachInteractionResult({
    required this.noteId,
    required this.recordInteractionOutcome,
    this.followedUpNote,
  });

  /// The `CoachNote.id` the interaction refers to.
  final int noteId;

  /// The action recorded — closed enum so the call site can
  /// pattern-match without a default branch.
  CoachInteraction get kind;

  /// The typed outcome of the `recordInteraction` store write.
  /// `CoachInteractionRecorded` or `CoachInteractionFailed` —
  /// never a thrown exception.
  final CoachInteractionResult recordInteractionOutcome;

  /// The bounded depth follow-up `CoachNote` the use-case appended
  /// on the `sure` path. `null` on every other path.
  final CoachNote? followedUpNote;
}

class RecordCoachInteractionSure extends RecordCoachInteractionResult {
  const RecordCoachInteractionSure({
    required super.noteId,
    required super.recordInteractionOutcome,
    this.followedUpNote,
  }) : super(followedUpNote: followedUpNote);

  @override
  CoachInteraction get kind => CoachInteraction.sure;

  /// The bounded depth follow-up `CoachNote` the use-case appended
  /// on the `sure` path. `null` when the active coach returned
  /// `NoCoachQuestion` for `depthFollowUp`, when the coach port
  /// threw (defensive), when a follow-up already exists for the
  /// plate (idempotent second tap, FR5), or when the store write
  /// failed. The UI still reflects the `sure` intent — the depth
  /// panel just doesn't render.
  final CoachNote? followedUpNote;
}

class RecordCoachInteractionAskLater extends RecordCoachInteractionResult {
  const RecordCoachInteractionAskLater({
    required super.noteId,
    required super.recordInteractionOutcome,
  });

  @override
  CoachInteraction get kind => CoachInteraction.askLater;
}

class RecordCoachInteractionDismiss extends RecordCoachInteractionResult {
  const RecordCoachInteractionDismiss({
    required super.noteId,
    required super.recordInteractionOutcome,
  });

  @override
  CoachInteraction get kind => CoachInteraction.dismiss;
}

class RecordCoachInteractionDepthAnswer extends RecordCoachInteractionResult {
  const RecordCoachInteractionDepthAnswer({
    required super.noteId,
    required super.recordInteractionOutcome,
  });

  @override
  CoachInteraction get kind => CoachInteraction.depthAnswer;
}

class RecordCoachInteraction {
  const RecordCoachInteraction({
    required Coach coach,
    required CoachNoteStore store,
  })  : _coach = coach,
        _store = store;

  final Coach _coach;
  final CoachNoteStore _store;

  /// Record one user action against the coach note `note.id` and,
  /// when `kind` is `sure`, append exactly ONE bounded depth
  /// follow-up `CoachNote` (anchored to the same plate, with
  /// `anchor: depthFollowUp`).
  ///
  /// Idempotency: a second `sure` tap on the same post-resolve
  /// note is a no-op on the depth-follow-up path — the use-case
  /// only appends a follow-up when one does not already exist for
  /// `note.id`. The `recordInteraction` write still happens so the
  /// log records every tap, but no extra note is persisted (FR5).
  ///
  /// Calm degrade: every store-write failure is collapsed to a
  /// typed `CoachInteractionResult` (the `recordInteractionOutcome`
  /// field on the returned `RecordCoachInteractionResult`). No raw
  /// exceptions cross the use-case boundary.
  Future<RecordCoachInteractionResult> call({
    required CoachNote note,
    required CoachInteraction kind,
  }) async {
    final log = CoachInteractionLog(
      noteId: note.id,
      kind: kind,
      at: DateTime.now().toUtc(),
    );
    final outcome = await _recordInteraction(log);

    final CoachNote? followedUp;
    switch (kind) {
      case CoachInteraction.sure:
        followedUp = await _maybeAppendDepthFollowUp(note);
      case CoachInteraction.askLater:
      case CoachInteraction.dismiss:
      case CoachInteraction.depthAnswer:
        followedUp = null;
    }

    return switch (kind) {
      CoachInteraction.sure => RecordCoachInteractionSure(
          noteId: note.id,
          recordInteractionOutcome: outcome,
          followedUpNote: followedUp,
        ),
      CoachInteraction.askLater => RecordCoachInteractionAskLater(
          noteId: note.id,
          recordInteractionOutcome: outcome,
        ),
      CoachInteraction.dismiss => RecordCoachInteractionDismiss(
          noteId: note.id,
          recordInteractionOutcome: outcome,
        ),
      CoachInteraction.depthAnswer => RecordCoachInteractionDepthAnswer(
          noteId: note.id,
          recordInteractionOutcome: outcome,
        ),
    };
  }

  /// Wrap `store.recordInteraction` so a thrown exception collapses
  /// to a typed `CoachInteractionFailed` (calm degrade). The
  /// `LocalCoachNoteStore` adapter already catches
  /// `SqliteException` and returns a typed failure — this guard is
  /// defensive against any future adapter that does not.
  Future<CoachInteractionResult> _recordInteraction(
    CoachInteractionLog log,
  ) async {
    try {
      return await _store.recordInteraction(log);
    } on Object {
      return const CoachInteractionFailed(
        StoreFailure(encryptedStoreError: SecureKeyFailure()),
      );
    }
  }

  /// Append one bounded depth follow-up `CoachNote` when the active
  /// coach has a non-empty question for the depth anchor + the
  /// post-resolve note's pattern AND no follow-up already exists
  /// for the note. Returns the appended `CoachNote` (with the real
  /// id) or `null` when:
  ///   * the note's anchor is not `postResolve` (defensive),
  ///   * the coach returned `NoCoachQuestion` for `depthFollowUp`,
  ///   * the coach port threw (defensive — `TemplateCoach` cannot
  ///     throw),
  ///   * a follow-up already exists for the same plate (idempotent
  ///     second tap, FR5),
  ///   * the store write failed,
  ///   * the post-resolve note's pattern cannot be recovered from
  ///     its question key (defensive — the key format is the
  ///     key-store contract).
  Future<CoachNote?> _maybeAppendDepthFollowUp(CoachNote note) async {
    if (note.anchor != CoachAnchor.postResolve) {
      // Defensive: only post-resolve notes are the source of a
      // depth follow-up. Open-plate hints + earlier depth notes
      // never spawn another follow-up.
      return null;
    }
    final pattern = _patternFromKey(note.questionKey);
    if (pattern == null) {
      return null;
    }

    final existing = await _existingFollowUpFor(note);
    if (existing) {
      return null;
    }

    final CoachQuestionResult result;
    try {
      result = _coach.questionFor(
        anchor: CoachAnchor.depthFollowUp,
        pattern: pattern,
      );
    } on Object {
      return null;
    }
    if (result is NoCoachQuestion) {
      return null;
    }
    final found = result as CoachFound;

    final draft = CoachNote(
      id: 0,
      plateLogId: note.plateLogId,
      anchor: CoachAnchor.depthFollowUp,
      questionKey: found.question.key,
      text: found.question.text,
      generatedAt: DateTime.now().toUtc(),
    );

    final appendResult = await _store.append(draft);
    return switch (appendResult) {
      CoachNoteAppended(:final note) => note,
      CoachNoteAppendFailure() => null,
    };
  }

  /// Resolve the `CompositionPattern` from the post-resolve note's
  /// `questionKey`. The key format is
  /// `{anchor.keyToken}.{pattern.keyToken}` (e.g. `post.resolve.vegLight`);
  /// the use-case matches the suffix against the v1 pattern set so
  /// the active `Coach` port can land on the same key store entry
  /// for the depth follow-up query.
  ///
  /// Returns `null` when the note's key does not start with the
  /// post-resolve anchor prefix or the suffix does not match any
  /// v1 pattern. Both are defensive — the active rung's key store
  /// is the single source of truth.
  CompositionPattern? _patternFromKey(String questionKey) {
    const anchorPrefix = 'post.resolve.';
    if (!questionKey.startsWith(anchorPrefix)) {
      return null;
    }
    final patternToken = questionKey.substring(anchorPrefix.length);
    for (final pattern in CompositionPattern.values) {
      if (pattern.keyToken == patternToken) {
        return pattern;
      }
    }
    return null;
  }

  /// `true` when a follow-up `CoachNote` already exists for the
  /// plate this note anchors to. The check queries the store for
  /// every note on the plate and filters by anchor; the depth
  /// follow-up is the only `depthFollowUp` row on a plate, so the
  /// result is at most one row. Idempotent second taps land here.
  Future<bool> _existingFollowUpFor(CoachNote note) async {
    final notes = await _store.forPlate(note.plateLogId);
    for (final candidate in notes) {
      if (candidate.anchor == CoachAnchor.depthFollowUp) {
        return true;
      }
    }
    return false;
  }
}
