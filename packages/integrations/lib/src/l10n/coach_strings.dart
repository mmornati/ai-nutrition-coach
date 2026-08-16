// The v1 `en` coach question key store (AD-7 / NFR3 / FR15 / NFR6 / NFR7).
//
// This is the single typed source for every coach string the app
// renders in Stories 2.2 / 2.3. The named NDP (No-Dark-Patterns)
// reviewer signs off on this file in one review pass — one localized
// question per `(anchor, pattern)` pair, calm and non-judgmental copy
// only.
//
// AD-7: every coach string resolves by key from this typed map.
// Widgets never interpolate strings; the key is the reviewable
// identity and `text` is the verbatim copy.
//
// NFR3: v1 is a bounded curated taxonomy — 2 anchors × 6 patterns =
// 12 entries. No unbounded generative output. If the reviewer rejects
// an entry, the task is to remove the entry, not add a new one.
//
// FR15: copy is calm, non-judgmental, no calorie-shaming, no
// streak-pressure, no restriction framing. Each entry is one plain
// sentence.
//
// NFR6: when the composition pattern needs a quantity, the copy uses
// honest ranges (`~2 fists`, `a handful`, `a small bowl`). No
// kcal-as-float anywhere in this file.
//
// NFR7: copy is plain text — no decorative unicode, no color tokens,
// no typography references. The UI applies its own theme via the
// existing whisper typography rules.
//
// AD-5: the active implementation (`TemplateCoach`) reads from this
// map. An AI-backed rung (Epic 3+) swaps in behind the same `Coach`
// port without touching this file.
//
// `keyToken` follows the rule `{anchor.keyToken}.{pattern.keyToken}`
// (e.g. `post.resolve.vegLight` for the post-resolve whisper on a
// veg-light plate). The convention makes the key sortable and
// greppable for the reviewer.

import 'package:domain_core/domain_core.dart';

/// Builds the canonical key for an `(anchor, pattern)` pair.
///
/// The format is `{anchor.keyToken}.{pattern.keyToken}` — e.g.
/// `post.resolve.vegLight`. Keeping the construction here lets the
/// `TemplateCoach` adapter, the key store entries, and any reviewer
/// tooling agree on the exact spelling without hand-rolling the same
/// string in two places.
String _coachKey(CoachAnchor anchor, CompositionPattern pattern) =>
    '${anchor.keyToken}.${pattern.keyToken}';

/// The v1 `en` coach question key store.
///
/// Two anchors (`postResolve`, `openPlate`) × six composition patterns
/// (`vegLight`, `proteinHeavy`, `starchHeavy`, `dairyLight`, `vegRich`,
/// `balanced`) = 12 entries. Each entry is a `CoachQuestion` whose
/// `text` is the verbatim calm copy the whisper renders.
///
/// The `const` map is evaluated at compile time; the `TemplateCoach`
/// adapter returns the same `CoachQuestion` instance for the same
/// `(anchor, pattern)` pair on every call, so the UI dedupes
/// deterministically on `key`.
final Map<CoachQuestionKey, CoachQuestion> enCoachStrings =
    <CoachQuestionKey, CoachQuestion>{
  // --- post-resolve whisper (Story 2.2 lands the surface) ---
  CoachQuestionKey(CoachAnchor.postResolve, CompositionPattern.vegLight):
      const CoachQuestion(
    key: 'post.resolve.vegLight',
    text: 'A handful of greens would round this plate out.',
    anchor: CoachAnchor.postResolve,
    pattern: CompositionPattern.vegLight,
  ),
  CoachQuestionKey(CoachAnchor.postResolve, CompositionPattern.proteinHeavy):
      const CoachQuestion(
    key: 'post.resolve.proteinHeavy',
    text: 'A small bowl of greens or roasted veg would lighten this up.',
    anchor: CoachAnchor.postResolve,
    pattern: CompositionPattern.proteinHeavy,
  ),
  CoachQuestionKey(CoachAnchor.postResolve, CompositionPattern.starchHeavy):
      const CoachQuestion(
    key: 'post.resolve.starchHeavy',
    text: 'Some veg on the side would balance this nicely.',
    anchor: CoachAnchor.postResolve,
    pattern: CompositionPattern.starchHeavy,
  ),
  CoachQuestionKey(CoachAnchor.postResolve, CompositionPattern.dairyLight):
      const CoachQuestion(
    key: 'post.resolve.dairyLight',
    text: 'If you have a bit of dairy around, it would round this off.',
    anchor: CoachAnchor.postResolve,
    pattern: CompositionPattern.dairyLight,
  ),
  CoachQuestionKey(CoachAnchor.postResolve, CompositionPattern.vegRich):
      const CoachQuestion(
    key: 'post.resolve.vegRich',
    text: 'A protein on the side would complete this plate.',
    anchor: CoachAnchor.postResolve,
    pattern: CompositionPattern.vegRich,
  ),
  CoachQuestionKey(CoachAnchor.postResolve, CompositionPattern.balanced):
      const CoachQuestion(
    key: 'post.resolve.balanced',
    text: 'Nice plate — anything you would change next time?',
    anchor: CoachAnchor.postResolve,
    pattern: CompositionPattern.balanced,
  ),

  // --- open-plate hint (Story 2.2 / 2.3 surfaces) ---
  CoachQuestionKey(CoachAnchor.openPlate, CompositionPattern.vegLight):
      const CoachQuestion(
    key: 'openPlate.vegLight',
    text: 'Greens would round this plate out.',
    anchor: CoachAnchor.openPlate,
    pattern: CompositionPattern.vegLight,
  ),
  CoachQuestionKey(CoachAnchor.openPlate, CompositionPattern.proteinHeavy):
      const CoachQuestion(
    key: 'openPlate.proteinHeavy',
    text: 'A handful of greens or veg would lighten this up.',
    anchor: CoachAnchor.openPlate,
    pattern: CompositionPattern.proteinHeavy,
  ),
  CoachQuestionKey(CoachAnchor.openPlate, CompositionPattern.starchHeavy):
      const CoachQuestion(
    key: 'openPlate.starchHeavy',
    text: 'Some veg on the side would balance this nicely.',
    anchor: CoachAnchor.openPlate,
    pattern: CompositionPattern.starchHeavy,
  ),
  CoachQuestionKey(CoachAnchor.openPlate, CompositionPattern.dairyLight):
      const CoachQuestion(
    key: 'openPlate.dairyLight',
    text: 'A bit of dairy would round this off if you have some.',
    anchor: CoachAnchor.openPlate,
    pattern: CompositionPattern.dairyLight,
  ),
  CoachQuestionKey(CoachAnchor.openPlate, CompositionPattern.vegRich):
      const CoachQuestion(
    key: 'openPlate.vegRich',
    text: 'A protein on the side would complete this plate.',
    anchor: CoachAnchor.openPlate,
    pattern: CompositionPattern.vegRich,
  ),
  CoachQuestionKey(CoachAnchor.openPlate, CompositionPattern.balanced):
      const CoachQuestion(
    key: 'openPlate.balanced',
    text: 'A calm, varied plate — anything you want to add?',
    anchor: CoachAnchor.openPlate,
    pattern: CompositionPattern.balanced,
  ),
};

/// The map key used by the v1 `en` key store.
///
/// `CoachAnchor` and `CompositionPattern` are both `enum`s, so
/// the pair is immutable and hashable. Equality + `hashCode` use both
/// fields so the same `(anchor, pattern)` pair always lands on the
/// same bucket.
class CoachQuestionKey {
  const CoachQuestionKey(this.anchor, this.pattern);

  final CoachAnchor anchor;
  final CompositionPattern pattern;

  /// The canonical string key for the entry — e.g.
  /// `post.resolve.vegLight`. Matches the `CoachQuestion.key` field.
  String get value => _coachKey(anchor, pattern);

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! CoachQuestionKey) return false;
    return other.anchor == anchor && other.pattern == pattern;
  }

  @override
  int get hashCode => Object.hash(anchor, pattern);

  @override
  String toString() => 'CoachQuestionKey($value)';
}