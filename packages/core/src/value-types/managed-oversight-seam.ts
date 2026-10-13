/**
 * v2 marker only (see docs/v2-managed-oversight.md): no behaviour, no profile machinery.
 * It exists so the type system is honest about the seam.
 */
export interface ManagedOversightSeam {
  readonly kind: 'managedOversightSeam';
}

export const MANAGED_OVERSIGHT_SEAM: ManagedOversightSeam = Object.freeze({
  kind: 'managedOversightSeam',
});

/** Redacted on purpose: never reveals an implementation. */
export function describeManagedOversightSeam(seam: ManagedOversightSeam): string {
  return seam.kind === 'managedOversightSeam' ? 'ManagedOversightSeam(v2 only — not in v1)' : '';
}
