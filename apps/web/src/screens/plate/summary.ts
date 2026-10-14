import type { PlateLog } from '@anc/core';

/** "Rice, salmon": the plate's foods in the order they were logged. */
export const plateSummary = (plate: PlateLog): string =>
  plate.entries.map((e) => e.databaseFood.displayName).join(', ');
