import type { ByokPreviousRung } from '../entities/byok-previous-rung';
import type { AiRungKind } from './ai-rung-kind';

/**
 * Which rung is active. `previousRung` lets removing a BYOK key flip back to the exact previous
 * choice. It never carries the key itself.
 */
export interface AiRungConfig {
  readonly kind: AiRungKind;
  readonly previousRung?: ByokPreviousRung;
}

export function aiRungConfigEquals(a: AiRungConfig, b: AiRungConfig): boolean {
  return a.kind === b.kind && a.previousRung?.previousKind === b.previousRung?.previousKind;
}
