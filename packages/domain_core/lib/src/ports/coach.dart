// `Coach` port (AD-1 / AD-5 / AD-7 / NFR3).
//
// The single sanctioned seam the UI calls for coach questions. The
// active implementation is selected by config — `TemplateCoach` is
// the v1 active rung (resolves the `en` key store in
// `packages/integrations/lib/src/l10n/coach_strings.dart`); Epic 3
// will swap in an AI-backed rung behind the same port without the
// core or the UI changing.
//
// AD-1: the port lives in `packages/domain_core` — pure Dart, no
// Flutter / drift / dio / mobile_scanner / image_picker imports. The
// AD-1 grep test in `packages/domain_core/test/domain_core_test.dart`
// pins the rule.
//
// AD-5: the core never branches on which rung is active. The
// contract is "call `questionFor`, pattern-match the sealed
// `CoachQuestionResult`, render — that's it." A future AI-backed
// implementation drops in behind the same provider in
// `apps/client/lib/main.dart` and Stories 2.2 / 2.3 keep working
// without changes.
//
// AD-7 / NFR3: every coach string resolves by key from a single typed
// key store. No string interpolation in widgets. The v1 taxonomy is
// a bounded curated set — one localized question per
// food-group/composition pattern, no unbounded generative output.
// Unknown patterns return `NoCoachQuestion` so the UI renders nothing
// (no fallback copy, no error UI).

import '../results/coach_question_result.dart';
import '../value_types/composition_pattern.dart';

/// The single sanctioned coach port (AD-1 / AD-5).
///
/// Adapters live in `packages/integrations`:
///   * `TemplateCoach`     — Story 2.1 ships the v1 active rung. The
///     adapter resolves the `en` locale from the single typed key
///     store (`coach_strings.dart`). One localized question per
///     `(anchor, pattern)` pair; unknown patterns return
///     `NoCoachQuestion` so the UI hides the whisper.
///   * `AiBackedCoach`     — Epic 3+ wraps a richer AI rung behind
///     the same port. The sealed result shape stays identical, so
///     Stories 2.2 / 2.3 do not change.
///
/// All implementations expose the same sealed `CoachQuestionResult`
/// return type so the UI never imports the concrete adapter type —
/// only this interface.
abstract interface class Coach {
  /// Resolve the coach question for the given `(anchor, pattern)`
  /// pair from the active key store.
  ///
  /// [anchor]  — the surface the question fires against
  ///             (`postResolve` whisper or `openPlate` hint).
  /// [pattern] — the food-group/composition pattern the question
  ///             resolves for. The v1 set is the six enum entries
  ///             on `CompositionPattern`; the adapter returns
  ///             `NoCoachQuestion` for any other value so the UI
  ///             hides the whisper without inspecting the request.
  ///
  /// Returns:
  ///   * [CoachFound]      — the key store resolved a non-empty
  ///     question for the pair. The UI renders `question.text`.
  ///   * [NoCoachQuestion] — the key store has no entry for the
  ///     pair (or the entry is empty). The UI renders nothing.
  ///
  /// Adapters must not throw across this boundary. Transport or
  /// lookup failures collapse into `NoCoachQuestion` so the UI
  /// handles the empty case by hiding the whisper (NFR3 / AD-7).
  CoachQuestionResult questionFor({
    required CoachAnchor anchor,
    required CompositionPattern pattern,
  });
}
