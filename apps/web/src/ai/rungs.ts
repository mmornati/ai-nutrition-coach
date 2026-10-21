import { AI_RUNG_KINDS, type AiRungConfig, type AiRungKind } from '@anc/core';

/**
 * Rungs a person can actually be on in this build. `hostedQuota` needs a relay run by the project
 * that does not exist (a credential must never ship in a client) and `local` is a v2 seam, so both
 * are listed as "Not available yet" and can never be selected or loaded. `instance` ("provided by
 * this server") is selectable in the build, but Your AI only offers it while the server says it is
 * on (`/ai/config.json`); a saved choice of it while the server has switched it off falls back to
 * a calm "this server does not offer AI" at the next photo, not to a silent No AI.
 */
export const SELECTABLE_RUNGS: readonly AiRungKind[] = Object.freeze(['noOp', 'byok', 'instance']);

export function isSelectableRung(kind: AiRungKind): boolean {
  return SELECTABLE_RUNGS.includes(kind);
}

/**
 * The four always-listed rungs in the order Your AI lists them. The `instance` rung is added after
 * No AI by `rungChoices` only while this server offers it.
 */
export const RUNG_LISTING: readonly { readonly kind: AiRungKind; readonly selectable: boolean }[] =
  Object.freeze([
    { kind: 'noOp', selectable: true },
    { kind: 'byok', selectable: true },
    { kind: 'hostedQuota', selectable: false },
    { kind: 'local', selectable: false },
  ] as const);

/** A rung token read from storage, or `null` for anything that is not one of the four. */
export function parseRungKind(token: unknown): AiRungKind | null {
  return typeof token === 'string' ? (AI_RUNG_KINDS.find((k) => k === token) ?? null) : null;
}

/** An unavailable rung can never be active: it becomes No AI. */
export function normaliseRungKind(kind: AiRungKind): AiRungKind {
  return isSelectableRung(kind) ? kind : 'noOp';
}

/**
 * Normalises a rung config: an unavailable kind (and an unavailable remembered "previous" rung)
 * collapses to No AI, and only BYOK carries a previous rung (never BYOK itself).
 */
export function normaliseRungConfig(config: AiRungConfig): AiRungConfig {
  const kind = normaliseRungKind(config.kind);
  if (kind !== 'byok') return { kind };
  const previous = config.previousRung?.previousKind;
  const previousKind =
    previous === undefined || previous === 'byok' ? 'noOp' : normaliseRungKind(previous);
  return { kind, previousRung: { previousKind } };
}
