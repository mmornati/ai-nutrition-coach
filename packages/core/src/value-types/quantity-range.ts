import { err, ok, type Result } from '../common';

/**
 * A portion range ("~1-2 pieces") for presets and estimates, optionally with the entry's weight in
 * grams (schema v2, docs/adr/0006).
 */
export interface QuantityRange {
  readonly low: number;
  readonly high: number;
  readonly unit: string;
  readonly displayLabel: string;
  /** The entry's weight in grams (for a range, the best single estimate). Absent = unknown. */
  readonly grams?: number;
  /** True when `grams` is a preset / AI / serving guess; false or absent when the person typed it. */
  readonly gramsEstimated?: boolean;
}

export const MAX_GRAMS = 5000;

/** Finite, > 0 and <= 5000 g. */
export function isValidGrams(grams: unknown): grams is number {
  return typeof grams === 'number' && Number.isFinite(grams) && grams > 0 && grams <= MAX_GRAMS;
}

/** `0 <= low <= high`, both finite. Checked at runtime at every store boundary. */
export function isValidRange(low: number, high: number): boolean {
  return Number.isFinite(low) && Number.isFinite(high) && low >= 0 && high >= 0 && low <= high;
}

export function isValidQuantity(quantity: QuantityRange): boolean {
  return (
    isValidRange(quantity.low, quantity.high) &&
    (quantity.grams === undefined || isValidGrams(quantity.grams))
  );
}

export type InvalidQuantityRange = {
  readonly kind: 'invalidQuantityRange';
  readonly message: string;
};

/** The validating factory. Returns an error result instead of throwing. */
export function quantityRange(input: QuantityRange): Result<QuantityRange, InvalidQuantityRange> {
  if (!isValidRange(input.low, input.high)) {
    return err({
      kind: 'invalidQuantityRange',
      message: `QuantityRange needs 0 <= low <= high, both finite (got ${input.low}..${input.high})`,
    });
  }
  if (input.grams !== undefined && !isValidGrams(input.grams)) {
    return err({
      kind: 'invalidQuantityRange',
      message: `QuantityRange grams must be finite, > 0 and <= ${MAX_GRAMS} (got ${input.grams})`,
    });
  }
  return ok({
    low: input.low,
    high: input.high,
    unit: input.unit,
    displayLabel: input.displayLabel,
    ...(input.grams !== undefined ? { grams: input.grams } : {}),
    ...(input.gramsEstimated !== undefined ? { gramsEstimated: input.gramsEstimated } : {}),
  });
}

/** A weighed quantity: `low = high = grams`. The default label is neutral; the UI words its own. */
export function gramsQuantity(
  grams: number,
  opts: { readonly estimated?: boolean; readonly displayLabel?: string } = {},
): QuantityRange {
  return {
    low: grams,
    high: grams,
    unit: 'g',
    displayLabel: opts.displayLabel ?? `${grams} g`,
    grams,
    gramsEstimated: opts.estimated ?? false,
  };
}

/** `copyWith` that cannot produce an invalid range. */
export function updateQuantityRange(
  base: QuantityRange,
  patch: Partial<QuantityRange>,
): Result<QuantityRange, InvalidQuantityRange> {
  return quantityRange({ ...base, ...patch });
}
