/**
 * The rungs behind the `AiRung` port. `instance` is the key the person who hosts this app keeps
 * on the server (a same-origin proxy; the key never reaches the browser). `hostedQuota` is a
 * relay run by the project and is not built. `local` is a declared v2 seam.
 */
export const AI_RUNG_KINDS = ['noOp', 'hostedQuota', 'byok', 'local', 'instance'] as const;
export type AiRungKind = (typeof AI_RUNG_KINDS)[number];

const LABELS: Readonly<Record<AiRungKind, string>> = {
  noOp: 'offline (no AI)',
  hostedQuota: 'free model',
  byok: 'your key',
  local: 'local model',
  instance: 'this server',
};

/** Human-readable label. */
export function aiRungLabel(kind: AiRungKind): string {
  return LABELS[kind];
}

/** Machine-readable token for logs and persistence. */
export function aiRungKeyToken(kind: AiRungKind): string {
  return kind;
}
