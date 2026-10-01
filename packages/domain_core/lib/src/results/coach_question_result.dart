// Typed results crossing the `Coach` port (conventions.md / AD-5).
//
// `CoachQuestionResult` is a sealed hierarchy with two variants:
//   * `CoachFound(question)`   — the key store resolved a non-empty
//     question for the requested `(anchor, pattern)` pair. The UI
//     renders the whisper with `question.text` and dedupes on
//     `question.key`.
//   * `NoCoachQuestion`        — the key store has no entry for the
//     requested `(anchor, pattern)` pair (or the entry is empty).
//     The UI renders nothing — no fallback copy, no error UI, no
//     whisper. The hush is the honest answer.
//
// AD-5: the active implementation never branches on which rung is
// active; the core only inspects whether the port call returned a
// typed `CoachQuestionResult`. AD-7 / NFR3 hold because every string
// resolves from a single typed key store; the empty case is the
// silent case.
//
// No raw exceptions cross this boundary — adapters return
// `NoCoachQuestion` for unknown / empty entries so the UI handles
// the empty case by hiding the whisper (no thrown exception, no
// fallback copy).

import '../entities/coach_question.dart';

/// Result of a `Coach.questionFor` call. Exactly one of the two
/// variants applies per call.
sealed class CoachQuestionResult {
  const CoachQuestionResult();
}

/// The key store resolved a non-empty question for the requested
/// `(anchor, pattern)` pair. `question.text` is the verbatim copy
/// the UI renders.
class CoachFound extends CoachQuestionResult {
  const CoachFound(this.question);

  /// The resolved question — see `CoachQuestion`. The UI renders
  /// `question.text` and dedupes on `question.key`.
  final CoachQuestion question;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CoachFound && other.question == question);

  @override
  int get hashCode => Object.hash('CoachFound', question);

  @override
  String toString() => 'CoachFound(${question.key})';
}

/// The key store has no entry for the requested `(anchor, pattern)`
/// pair. The UI renders nothing — no whisper, no fallback copy, no
/// error UI. The silent path is the honest answer.
class NoCoachQuestion extends CoachQuestionResult {
  const NoCoachQuestion();

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is NoCoachQuestion;

  @override
  int get hashCode => (NoCoachQuestion).hashCode;

  @override
  String toString() => 'NoCoachQuestion()';
}
