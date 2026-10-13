import type { EpochMs } from '../common';

/** Durable dismissal marker for a coach note: `note:<id>`. */
export function coachNoteDismissalKey(noteId: number): string {
  return `note:${noteId}`;
}

/**
 * Durable dismissal marker for the open-plate hint, keyed by (local day, slot):
 * `openPlate:<yyyy-MM-dd>:<slot>`. No synthetic coach note is ever created for a hint.
 */
export function openPlateDismissalKey(input: {
  readonly day: EpochMs;
  readonly slotName: string;
}): string {
  const d = new Date(input.day);
  const y = String(d.getFullYear()).padStart(4, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `openPlate:${y}-${m}-${dd}:${input.slotName}`;
}
