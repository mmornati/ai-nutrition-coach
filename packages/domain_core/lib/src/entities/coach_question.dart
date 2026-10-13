// A single coach question the key store ships (AD-7 / NFR3 / FR15).
//
// `CoachQuestion` is the immutable value type the key store hands back
// to the UI. It carries:
//   * `key`    — the reviewable identity the named NDP reviewer signs
//                off on in `packages/integrations/lib/src/l10n/
//                coach_strings.dart`. Two questions with the same
//                `key` are the same question; the UI can dedupe on
//                `key` alone.
//   * `text`   — the localized, calm, non-judgmental copy string the
//                whisper renders. Plain text only — no decorative
//                unicode, no color tokens, no typography references
//                (NFR7 — the UI applies its own theme).
//   * `anchor` — the surface the question fires against.
//   * `pattern`— the food-group/composition pattern the question
//                resolves for.
//
// Equality is by `key` only — the same question renders the same
// copy across the app, and the UI can rely on `==` to dedupe without
// inspecting `text`. `hashCode` is `key.hashCode`: it must be derived from
// exactly the fields `==` compares (a hash that also mixed in `text` would
// violate the `==`/`hashCode` contract for two questions with the same key).
//
// The file is pure-Dart: no Flutter / drift / dio / mobile_scanner /
// image_picker / dart:io imports. The AD-1 grep test in
// `packages/domain_core/test/domain_core_test.dart` pins the rule.

import '../value_types/composition_pattern.dart';

class CoachQuestion {
  const CoachQuestion({
    required this.key,
    required this.text,
    required this.anchor,
    required this.pattern,
  });

  /// The reviewable identity the named NDP reviewer signs off on.
  /// Two questions with the same `key` compare equal — the UI dedupes
  /// on `key` alone without inspecting `text`.
  final String key;

  /// The localized copy string the whisper renders. Plain text only —
  /// no decorative unicode, no color tokens, no typography references
  /// (NFR7). The key store invariant is "≥1 char, calm, non-
  /// judgmental"; this field carries the verbatim copy.
  final String text;

  /// The surface the question fires against (post-resolve whisper or
  /// open-plate hint).
  final CoachAnchor anchor;

  /// The food-group/composition pattern the question resolves for.
  /// Combined with `anchor` it identifies a single entry in the key
  /// store.
  final CompositionPattern pattern;

  CoachQuestion copyWith({
    String? key,
    String? text,
    CoachAnchor? anchor,
    CompositionPattern? pattern,
  }) {
    return CoachQuestion(
      key: key ?? this.key,
      text: text ?? this.text,
      anchor: anchor ?? this.anchor,
      pattern: pattern ?? this.pattern,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! CoachQuestion) return false;
    return other.key == key;
  }

  @override
  int get hashCode => key.hashCode;

  @override
  String toString() =>
      'CoachQuestion(key: "$key", text: "$text", '
      'anchor: $anchor, pattern: $pattern)';
}
