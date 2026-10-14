import type { SyncOpStatusValue } from '@anc/core';
import { dayStrings } from './strings';

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
  onDevice: 'bg-line-veg',
  synced: 'bg-porcelain',
  pending: 'border-2 border-dashed border-porcelain',
  retryLater: 'border-2 border-dashed border-signal-muted',
};

export interface StatusChipProps {
  /** Core per-plate sync rollup; omit or null for "on this device". */
  readonly status?: SyncOpStatusValue | null;
  readonly className?: string;
}

/**
 * Where a plate's data lives. Not a button, never red. The visible label is hidden from
 * assistive tech and a polite live region announces the state, including later changes.
 */
export function StatusChip({ status = null, className = '' }: StatusChipProps) {
  const state = chipStateFor(status);
  const label = dayStrings.chip[state];
  return (
    <span
      data-chip-state={state}
      className={`font-display text-label border-porcelain text-porcelain inline-flex min-h-9 items-center gap-[7px] border-2 px-2.5 py-1.5 font-bold whitespace-nowrap uppercase ${className}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-[9px] w-[9px] rounded-full ${DOT[state]}`}
      />
      <span aria-hidden="true">{label}</span>
      <span aria-live="polite" role="status" className="sr-only">
        {dayStrings.chipAnnouncement(label)}
      </span>
    </span>
  );
}
