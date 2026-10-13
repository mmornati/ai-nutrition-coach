// The bounded v1 coach taxonomy (NFR3).
//
// `CompositionPattern` is the food-group/composition pattern the v1
// coach question taxonomy resolves against. One enum entry per pattern —
// the v1 set is curated, not unbounded generative output. If a future
// story needs a new pattern, the named NDP reviewer signs off in the
// key store; the spec ships the exact six-pattern set below.
//
// `CoachAnchor` is the surface the coach question fires against. The
// v1 set is three anchors:
//   * `postResolve`    — the whisper that lands on a just-logged plate.
//   * `openPlate`      — the open-plate hint that lands on next/empty
//     plates ("Greens would round this plate out…").
//   * `depthFollowUp`  — the bounded follow-up coach note the
//     `RecordCoachInteraction(sure)` use-case writes when the user
//     taps `[sure]` on a post-resolve whisper (Story 2.3, FR5). The
//     follow-up is itself a `CoachNote` with `anchor: depthFollowUp`;
//     the `key` store does not need a separate entry because the
//     key store holds the question, the anchor only carries the
//     surface.
//
// Both enums live in the core so the port, the result hierarchy, the
// value types, and the key store all agree on the same identifiers
// (AD-1 / AD-5 / AD-7). No Flutter / drift / dio / mobile_scanner
// imports — the AD-1 grep test pins the rule.

/// The bounded v1 food-group/composition patterns the coach question
/// taxonomy resolves against.
///
/// Declaration order is the order the key store ships under so the
/// single reviewable file (`packages/integrations/lib/src/l10n/
/// coach_strings.dart`) reads top-to-bottom in the same shape. The
/// string name of each enum entry is the kebab-cased token used in
/// keys (e.g. `vegLight` → `post.resolve.vegLight`).
enum CompositionPattern {
  vegLight,
  proteinHeavy,
  starchHeavy,
  dairyLight,
  vegRich,
  balanced;

  /// The token used in coach question keys, kebab-cased from the
  /// enum name. The `postResolve` / `openPlate` anchor prefixes the
  /// key (e.g. `post.resolve.vegLight`).
  String get keyToken {
    switch (this) {
      case CompositionPattern.vegLight:
        return 'vegLight';
      case CompositionPattern.proteinHeavy:
        return 'proteinHeavy';
      case CompositionPattern.starchHeavy:
        return 'starchHeavy';
      case CompositionPattern.dairyLight:
        return 'dairyLight';
      case CompositionPattern.vegRich:
        return 'vegRich';
      case CompositionPattern.balanced:
        return 'balanced';
    }
  }
}

/// The surface a coach question fires against. The v1 set is three
/// anchors; future anchors (e.g. a settings nudge) would land here
/// after the NDP reviewer signs off in the key store.
enum CoachAnchor {
  postResolve,
  openPlate,
  depthFollowUp;

  /// The token used in coach question keys, kebab-cased from the
  /// enum name. `depthFollowUp` is not keyed in the v1 store — the
  /// depth follow-up is itself a `CoachNote`, not a typed entry in
  /// the `(anchor, pattern)` taxonomy.
  String get keyToken {
    switch (this) {
      case CoachAnchor.postResolve:
        return 'post.resolve';
      case CoachAnchor.openPlate:
        return 'openPlate';
      case CoachAnchor.depthFollowUp:
        return 'depth.followUp';
    }
  }
}
