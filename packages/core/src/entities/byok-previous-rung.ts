import type { AiRungKind } from '../value-types/ai-rung-kind';

/** Remembers the rung that was active before a BYOK key was entered. */
export interface ByokPreviousRung {
  readonly previousKind: AiRungKind;
}
