// Riverpod providers for the v1 coach seam (Story 2.1 / AD-5 / AD-7).
//
// `coachProvider` is the single Riverpod seam the Day Board / whisper
// surfaces read from. The active implementation is selected by config
// — `TemplateCoach()` is the v1 active rung, overriding the port at
// the `ProviderScope` root in `main.dart`. An AI-backed rung (Epic 3+)
// drops in behind the same provider without touching Stories 2.2 / 2.3.
//
// AD-1: this file lives under `apps/client/lib/` (the only place
// Riverpod state and the coach port seam live together). The domain
// core never imports Flutter or Riverpod; the structural grep test
// in `packages/domain_core/test/domain_core_test.dart` pins the rule.
//
// AD-5: the seam hands out `Coach` (the interface), never the
// concrete `TemplateCoach` type. Tests inject a fake `Coach` that
// records `questionFor` calls and returns configured results.

import 'package:domain_core/domain_core.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The wired `Coach` — overridden in `main.dart` with
/// `TemplateCoach()` (the v1 active rung). Tests inject a
/// `FakeCoach` that records `questionFor` calls and returns
/// configured `CoachQuestionResult`s.
final coachProvider = Provider<Coach>(
  (ref) => throw UnimplementedError(
    'coachProvider must be overridden at the ProviderScope root '
    'with the result of `TemplateCoach()` — see apps/client/lib/main.dart.',
  ),
);

/// Test double — records every `questionFor` call and returns a
/// configured result. Defaults to `NoCoachQuestion()` so tests that
/// do not configure a result still exercise the empty whisper path.
class FakeCoach implements Coach {
  FakeCoach();

  final List<({CoachAnchor anchor, CompositionPattern pattern})> calls =
      <({CoachAnchor anchor, CompositionPattern pattern})>[];
  CoachQuestionResult _next = const NoCoachQuestion();

  /// Configure the next [questionFor] call's return value. The
  /// result is consumed once and then reverts to the default
  /// `NoCoachQuestion`.
  void emit(CoachQuestionResult result) {
    _next = result;
  }

  @override
  CoachQuestionResult questionFor({
    required CoachAnchor anchor,
    required CompositionPattern pattern,
  }) {
    calls.add((anchor: anchor, pattern: pattern));
    final next = _next;
    _next = const NoCoachQuestion();
    return next;
  }
}
