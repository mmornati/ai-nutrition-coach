import type { FoodEntryDraft } from '@anc/core';

/** JSON with sorted keys, so two equal values spell the same whatever order they were built in. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** True when two plates' foods are the same, in the same order, down to every amount and value. */
export function sameDrafts(a: readonly FoodEntryDraft[], b: readonly FoodEntryDraft[]): boolean {
  return (
    a.length === b.length &&
    a.every((d, i) => {
      const other = b[i];
      return (
        other !== undefined &&
        canonical({ f: d.databaseFood, q: d.quantity }) ===
          canonical({ f: other.databaseFood, q: other.quantity })
      );
    })
  );
}
