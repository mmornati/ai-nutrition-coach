/** Counts only; the per-plate chip is derived separately. */
export interface SyncQueueState {
  readonly pending: number;
  readonly synced: number;
  readonly failed: number;
}

export function syncQueueTotal(state: SyncQueueState): number {
  return state.pending + state.synced + state.failed;
}

export const SYNC_OP_STATUSES = ['pending', 'synced', 'failed'] as const;
export type SyncOpStatusValue = (typeof SYNC_OP_STATUSES)[number];

/** Unknown stored values read as `pending` (the conservative state). */
export function parseSyncOpStatus(raw: string): SyncOpStatusValue {
  return SYNC_OP_STATUSES.find((s) => s === raw) ?? 'pending';
}

/**
 * Per-plate rollup of its ops' statuses. Conservative: any pending op keeps the plate pending;
 * otherwise any failed op shows as failed (a calm "retry later", a plate with a failed op never
 * shows as synced); otherwise synced. A plate with no ops has no status: `null` means "on this
 * device / never queued".
 */
export function rollupPlateStatus(statuses: Iterable<SyncOpStatusValue>): SyncOpStatusValue | null {
  let rolled: SyncOpStatusValue | null = null;
  for (const status of statuses) {
    if (status === 'pending') return 'pending';
    if (status === 'failed') rolled = 'failed';
    else rolled ??= 'synced';
  }
  return rolled;
}
