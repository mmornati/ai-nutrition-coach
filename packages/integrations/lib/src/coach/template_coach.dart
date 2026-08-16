// `TemplateCoach` — the v1 active `Coach` rung (Story 2.1 / AD-5 /
// AD-7 / NFR3).
//
// Resolves the `en` locale from the single typed key store at
// `packages/integrations/lib/src/l10n/coach_strings.dart`. For every
// `(anchor, pattern)` pair in the v1 taxonomy the adapter returns
// `CoachFound(question)`; for any other value (a future pattern the
// key store does not yet cover, an entry the reviewer has removed)
// the adapter returns `NoCoachQuestion` so the UI renders nothing
// without inspecting the request.
//
// AD-1: the adapter lives in `packages/integrations`. It imports
// `domain_core` for the port + value types; no Flutter / drift /
// dio / mobile_scanner / image_picker imports cross the seam.
//
// AD-5: the adapter implements the `Coach` interface only. The core
// never inspects which rung is active; the UI never imports this
// concrete type — it reads `coachProvider` and dispatches through
// `Coach.questionFor`. A future AI-backed adapter drops in behind
// the same provider without touching this file or Stories 2.2 / 2.3.
//
// AD-7 / NFR3: every string resolves by key from the typed key store.
// No interpolation in widgets; no LLM call on the key-store path;
// the v1 set is the bounded curated 12-entry taxonomy.
//
// No raw exceptions cross this boundary — unknown / missing entries
// collapse to `NoCoachQuestion` so the UI handles the empty case by
// hiding the whisper.

import 'package:domain_core/domain_core.dart';

import '../l10n/coach_strings.dart';

/// The v1 active `Coach` rung. Looks up every `(anchor, pattern)`
/// pair in the `en` key store and returns the verbatim `CoachQuestion`.
/// Unknown patterns return `NoCoachQuestion` so the UI hides the
/// whisper (AD-7 / NFR3).
class TemplateCoach implements Coach {
  /// The v1 active rung has no constructor arguments — the `en`
  /// key store is a compile-time `const` map, so every adapter
  /// instance returns the same `CoachQuestion` for the same key.
  /// `const`-constructible so the production override in `main.dart`
  /// is a literal `const TemplateCoach()`.
  const TemplateCoach();

  @override
  CoachQuestionResult questionFor({
    required CoachAnchor anchor,
    required CompositionPattern pattern,
  }) {
    final question = enCoachStrings[CoachQuestionKey(anchor, pattern)];
    if (question == null) {
      return const NoCoachQuestion();
    }
    return CoachFound(question);
  }
}