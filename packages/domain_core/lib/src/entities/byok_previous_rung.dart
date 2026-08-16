// `ByokPreviousRung` — the previous-rung value type for the
// BYOK rung (Story 3.3 / FR7).
//
// When the user enters a BYOK key the active rung flips from
// (e.g.) `AiRungKind.hostedQuota` to `AiRungKind.byok`. The rung
// remembers the previous kind in `AiRungConfig.previousRung` so a
// key removal can flip back to the user's exact previous choice —
// not always `AiRungKind.noOp`.
//
// The file is pure-Dart: no Flutter / drift / dio / mobile_scanner
// / flutter_secure_storage imports. The AD-1 grep test in
// `packages/domain_core/test/domain_core_test.dart` pins the rule.

import 'ai_rung_kind.dart';

/// The previous-rung value type for the BYOK rung (FR7). The
/// value hangs off `AiRungConfig.previousRung` so a key removal
/// can flip the active rung back to the user's exact previous
/// choice.
class ByokPreviousRung {
  const ByokPreviousRung({required this.previousKind});

  /// The kind that was active before the user entered the BYOK
  /// key. FR7 — key removal returns the user to the previous
  /// rung exactly, not always `AiRungKind.noOp`.
  final AiRungKind previousKind;

  /// Equality by `previousKind` only. Two values with the same
  /// kind compare equal — the provider graph can rely on `==` to
  /// short-circuit without inspecting every field.
  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! ByokPreviousRung) return false;
    return other.previousKind == previousKind;
  }

  @override
  int get hashCode => previousKind.hashCode;

  @override
  String toString() => 'ByokPreviousRung(previousKind: '
      '${previousKind.keyToken})';
}