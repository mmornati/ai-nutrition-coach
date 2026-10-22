// The ONE place that decides which of two versions of a record wins. The pure merge uses it on two
// snapshots, and both stores use it when a snapshot is applied to what is stored, so merging and
// applying cannot disagree (two devices that disagreed on a tie would never converge).

import { compareHlc } from './hlc';

/** JSON text with sorted keys: a total, key-order-independent way to compare two values. */
export function canonicalText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalText).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalText(record[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Code-unit order: the same on every platform and locale, unlike `localeCompare`. */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Of two records that should be equal but are not, the one with the larger canonical text. */
export const pickLarger = <T>(a: T, b: T): T =>
  compareText(canonicalText(a), canonicalText(b)) >= 0 ? a : b;

/**
 * Last writer wins: the later `updatedAtHlc`. When the stamps are equal (possible only for legacy
 * rows or a faulty device) the record with the larger canonical text wins, so the choice does not
 * depend on which side is "local". Returns `a` when the two are identical.
 */
export function pickStamped<T extends { readonly updatedAtHlc: string }>(a: T, b: T): T {
  const order = compareHlc(a.updatedAtHlc, b.updatedAtHlc);
  return order > 0 ? a : order < 0 ? b : pickLarger(a, b);
}

/** A record stamped `stamp` outlives a tombstone only if it was written strictly after it. */
export const survivesTombstone = (stamp: string, deletedAt: string | null | undefined): boolean =>
  deletedAt === null || deletedAt === undefined || compareHlc(stamp, deletedAt) > 0;
