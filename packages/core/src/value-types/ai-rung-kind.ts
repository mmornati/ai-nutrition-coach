/** The four rungs behind the `AiRung` port. `local` is a declared v2 seam. */
export const AI_RUNG_KINDS = ['noOp', 'hostedQuota', 'byok', 'local'] as const;
export type AiRungKind = (typeof AI_RUNG_KINDS)[number];

const LABELS: Readonly<Record<AiRungKind, string>> = {
  noOp: 'offline (no AI)',
  hostedQuota: 'free model',
  byok: 'your key',
  local: 'local model',
};

/** Human-readable label. */
export function aiRungLabel(kind: AiRungKind): string {
  return LABELS[kind];
}

/** Machine-readable token for logs and persistence. */
export function aiRungKeyToken(kind: AiRungKind): string {
  return kind;
}
