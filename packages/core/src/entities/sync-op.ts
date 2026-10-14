import type { EpochMs } from '../common';

export const SYNC_OP_KINDS = ['plateLogCreated', 'plateLogUpdated', 'plateLogDeleted'] as const;
export type SyncOpKind = (typeof SYNC_OP_KINDS)[number];

/** The unit the durable outbox enqueues and the `SyncAdapter` drains. */
export interface SyncOp {
  readonly opId: string;
  readonly plateLogId: number;
  readonly enqueuedAtUtc: EpochMs;
  readonly kind: SyncOpKind;
  readonly payload: Readonly<Record<string, unknown>>;
}

export function syncOp(input: {
  readonly opId: string;
  readonly plateLogId: number;
  readonly enqueuedAtUtc: EpochMs;
  readonly kind: SyncOpKind;
  readonly payload?: Readonly<Record<string, unknown>>;
}): SyncOp {
  return {
    opId: input.opId,
    plateLogId: input.plateLogId,
    enqueuedAtUtc: input.enqueuedAtUtc,
    kind: input.kind,
    payload: input.payload ?? {},
  };
}

/** Value equality by the unique triple `(opId, plateLogId, kind)`. */
export function syncOpEquals(a: SyncOp, b: SyncOp): boolean {
  return a.opId === b.opId && a.plateLogId === b.plateLogId && a.kind === b.kind;
}
