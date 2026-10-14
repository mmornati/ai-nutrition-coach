import { databaseFood, type DatabaseFood, type QuantityRange } from '@anc/core';
import { isKnownUnit } from '../../catalog';
import { strings } from '../../i18n';

/**
 * Small log-time helpers the sheets share. They mirror `kOneServing` / `manualFood` from the
 * earlier client's plate-logging state; when the state layer lands (phase 4/5) they move next
 * to `recordPlate` and these re-export from there.
 */
export const oneServing = (): QuantityRange => ({
  low: 1,
  high: 1,
  unit: 'serving',
  displayLabel: strings().portion.oneServing,
});

/** The food for a name the person typed. Its group is unknown (`other`). */
export function manualFood(name: string): DatabaseFood {
  return databaseFood({
    sourceRef: `manual:${name.toLowerCase()}`,
    displayName: name,
    source: 'manual',
  });
}

/**
 * The same portion. For a unit the catalogue words, the label is only a rendering of
 * `(low, high, unit)` (a plate logged in another language says the same), so it is not compared;
 * for a free-text unit the stored label is all there is.
 */
export function sameQuantity(a: QuantityRange, b: QuantityRange): boolean {
  return (
    a.low === b.low &&
    a.high === b.high &&
    a.unit === b.unit &&
    (isKnownUnit(a.unit) || a.displayLabel === b.displayLabel)
  );
}

/** The presets to show: the given ones, or the `~1 serving` fallback when there are none. */
export function effectivePresets(presets: readonly QuantityRange[]): readonly QuantityRange[] {
  return presets.length > 0 ? presets : [oneServing()];
}

/** Concatenate preset lists, dropping repeats (first occurrence wins, so order is meaningful). */
export function uniqueQuantities(...lists: readonly (readonly QuantityRange[])[]): QuantityRange[] {
  const out: QuantityRange[] = [];
  for (const list of lists) {
    for (const q of list) if (!out.some((o) => sameQuantity(o, q))) out.push(q);
  }
  return out;
}

export function sameFood(a: DatabaseFood, b: DatabaseFood): boolean {
  return a.source === b.source && a.sourceRef === b.sourceRef;
}
