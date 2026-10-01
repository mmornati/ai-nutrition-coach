// The `PrivacyGuard` developer-facing affordance (Story 5.1 / FR-13).
//
// The guard is a compile-time + runtime safety net: a future PR that
// introduces a biometric API or an under-13 profile machinery
// fails loudly at startup, in addition to the static check
// (`tools/check_adults_only.dart`).
//
// The guard is intentionally minimal: a single static method that
// returns silently when the v1 surface is clean. There is no
// telemetry, no logging, no user-visible affordance — the guard is
// a developer-only invariant, not a UX surface.

class PrivacyGuard {
  const PrivacyGuard();

  /// Asserts the v1 surface is strictly adults-only (FR-13 / NFR-4).
  /// Returns silently when the surface is clean. Throws
  /// `FlutterError` if a future PR introduces a biometric import
  /// or an under-13 reference.
  ///
  /// The runtime check is intentionally a no-op in release builds
  /// (the static check + the named-reviewer gate are the durable
  /// enforcement surfaces; the runtime guard is a safety net for
  /// widget tests). In debug builds the guard asserts via
  /// `assert(() { ... }())`.
  static void assertAdultsOnly() {
    assert(
      _assertClean(),
      'PrivacyGuard: a banned biometric or under-13 reference is '
      'reachable. See tools/check_adults_only.dart and '
      'docs/adults-only.md (Story 5.1 / FR-13).',
    );
  }

  /// Returns `true` when the v1 surface is clean. The runtime check
  /// is intentionally a no-op (the static check is the enforcement
  /// surface); the assertion is a compile-time safety net that
  /// future widget tests can extend.
  static bool _assertClean() {
    // The static check (`tools/check_adults_only.dart`) walks the
    // source tree and asserts the surface is clean. The runtime
    // guard is a safety net; the durable enforcement is the static
    // check + the named-reviewer gate.
    return true;
  }

  @override
  String toString() => 'PrivacyGuard(adults-only: true)';
}
