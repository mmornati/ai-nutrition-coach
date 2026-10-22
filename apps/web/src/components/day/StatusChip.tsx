import type { SyncOpStatusValue } from '@anc/core';
import { useStrings } from '../../i18n';
import { Chip, cn } from '../primitives';

export type ChipState = 'onDevice' | 'pending' | 'synced' | 'retryLater';

/** Core sync status to chip state. `null` (never queued, or no transport) is "on this device". */
export function chipStateFor(status: SyncOpStatusValue | null | undefined): ChipState {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'synced':
      return 'synced';
    case 'failed':
      return 'retryLater';
    default:
      return 'onDevice';
  }
}

const DOT: Readonly<Record<ChipState, string>> = {
  onDevice: 'bg-ink',
  synced: 'bg-ink outline outline-1 outline-offset-1 outline-ink',
  pending: 'border-2 border-solid border-ink',
  retryLater: 'border-2 border-dashed border-thread',
};

export interface StatusChipProps {
  /**
   * Whether a sync transport is configured. False forces "On this device" whatever `status` says:
   * with nowhere to sync to, pending/synced/retry would be untrue.
   */
  readonly hasTransport: boolean;
  /** Core per-plate sync rollup; omit or null for "on this device". */
  readonly status?: SyncOpStatusValue | null;
  readonly className?: string | undefined;
}

/**
 * Where a plate's data lives. Not a button, never red, plain static text: changes are announced
 * once for the whole page by `SyncAnnouncer`, not by each chip.
 */
export function StatusChip({ hasTransport, status = null, className }: StatusChipProps) {
  const state = hasTransport ? chipStateFor(status) : 'onDevice';
  const label = useStrings().chip[state];
  return (
    <Chip
      data-chip-state={state}
      dot
      dotClassName={DOT[state]}
      className={cn('text-ink', className)}
    >
      {label}
    </Chip>
  );
}
