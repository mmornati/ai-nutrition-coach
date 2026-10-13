import { frozenList, type EpochMs } from '../common';
import type { PlateLog } from '../entities/plate-log';

/**
 * Plates with `from <= loggedAtUtc < to` (half-open, same semantics as the SQL store),
 * newest first. A missing bound is open.
 */
export function platesInRange(
  plates: Iterable<PlateLog>,
  range: { readonly from?: EpochMs | undefined; readonly to?: EpochMs | undefined } = {},
): readonly PlateLog[] {
  const { from, to } = range;
  const kept = [...plates].filter(
    (p) =>
      (from === undefined || p.loggedAtUtc >= from) && (to === undefined || p.loggedAtUtc < to),
  );
  kept.sort((a, b) => b.loggedAtUtc - a.loggedAtUtc);
  return frozenList(kept);
}
