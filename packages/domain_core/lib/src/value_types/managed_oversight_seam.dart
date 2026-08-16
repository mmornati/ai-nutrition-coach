// The `ManagedOversightSeam` marker (Story 5.2 / FR-14 / OQ-4).
//
// The managed-oversight concept is documented as a declared v2
// seam — read-only-from-guardian, framed as support not
// surveillance. **No v1 implementation ships.** The seam exists in
// the type system and the docs so the architecture doesn't preclude
// the v2 feature while it remains out of v1 pending COPPA /
// privacy-law review (PRD OQ-4).
//
// The marker is intentionally minimal: a const class with a
// redacted `toString`. There is no behaviour, no fields, no
// service surface — just the architectural declaration.

class ManagedOversightSeam {
  const ManagedOversightSeam();

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ManagedOversightSeam;
  }

  @override
  int get hashCode => (const Object()).hashCode;

  @override
  String toString() => 'ManagedOversightSeam(v2 only — not in v1)';
}
