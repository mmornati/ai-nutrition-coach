import { databaseFood, localTime, plateLog } from '@anc/core';
import type { FoodGroup, PlateLog } from '@anc/core';

/** Test fixtures shared by the day component tests. */
export function makePlate(
  id: number,
  hour: number,
  minute: number,
  groups: FoodGroup[],
  day = 13,
): PlateLog {
  return plateLog({
    id,
    loggedAtUtc: localTime(2026, 10, day, hour, minute),
    entries: groups.map((g, i) => ({
      id: id * 10 + i,
      plateLogId: id,
      databaseFood: databaseFood({
        sourceRef: `t:${id}:${i}`,
        displayName: `Food ${id}-${i}`,
        source: 'seed',
        foodGroup: g,
      }),
      quantity: { low: 1, high: 1, unit: 'x', displayLabel: '~1' },
    })),
  });
}

/** Stub matchMedia so `(prefers-reduced-motion: reduce)` matches (or not). */
export function stubReducedMotion(reduce: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

export function clearMatchMedia(): void {
  // @ts-expect-error restore the jsdom default (no matchMedia)
  delete window.matchMedia;
}
