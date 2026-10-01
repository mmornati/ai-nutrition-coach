// Build-time configuration for the active `AiRung` (Story 3.1 / AD-5).
//
// Exactly one rung is active at any time, chosen by `AiRungConfig` —
// a build-time value resolved once at app start and overridden into
// `aiRungConfigProvider` in `apps/client/lib/main.dart`. The core
// and the UI never branch on which rung is active; the provider
// graph reads this value and constructs the matching adapter.
//
// Story 3.3 extends this value with an optional `previousRung` field
// so a BYOK key removal can flip the active rung back to the user's
// exact previous choice (FR7). Story 3.1 ships the base shape with
// no `previousRung`; the field is added in Story 3.3 without
// breaking the seam.
//
// The file is pure-Dart: no Flutter / drift / dio / mobile_scanner /
// flutter_secure_storage imports. The AD-1 grep test in
// `packages/domain_core/test/domain_core_test.dart` pins the rule.

import '../entities/byok_previous_rung.dart';
import 'ai_rung_kind.dart';

/// The build-time configuration for the active `AiRung`. Resolved
/// once at app start; the value is immutable for the lifetime of
/// the app and never branched on by the core (AD-5).
class AiRungConfig {
  const AiRungConfig({required this.kind, this.previousRung});

  /// The active rung. Exactly one of the four `AiRungKind` values;
  /// selection is a build-time decision (AD-5).
  final AiRungKind kind;

  /// The previous rung the BYOK key replaced (Story 3.3 / FR7).
  /// Only set when the active kind is `AiRungKind.byok`; `null`
  /// for all other kinds. A key removal reads this field and
  /// flips the active kind back to `previousKind` exactly — not
  /// always `AiRungKind.noOp`.
  final ByokPreviousRung? previousRung;

  /// Equality by `kind` and `previousRung`. Two configs compare
  /// equal when both fields match — the provider graph can rely
  /// on `==` to short-circuit without inspecting every field.
  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! AiRungConfig) return false;
    return other.kind == kind && other.previousRung == previousRung;
  }

  @override
  int get hashCode => Object.hash(kind, previousRung);

  @override
  String toString() =>
      'AiRungConfig(kind: ${kind.keyToken}, '
      'previousRung: $previousRung)';
}
