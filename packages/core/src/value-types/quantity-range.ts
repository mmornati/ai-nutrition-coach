import { err, ok, type Result } from '../common';

/** A portion range ("~1-2 pieces") for presets and estimates. Grams and nutrients arrive in schema v2 (docs/adr/0006). */
export interface QuantityRange {
  readonly low: number;
  readonly high: number;
  readonly unit: string;
  readonly displayLabel: string;
}

/** `0 <= low <= high`, both finite. Checked at runtime at every store boundary. */
export function isValidRange(low: number, high: number): boolean {
  return Number.isFinite(low) && Number.isFinite(high) && low >= 0 && high >= 0 && low <= high;
}

export function isValidQuantity(quantity: QuantityRange): boolean {
  return isValidRange(quantity.low, quantity.high);
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
  return ok({
    low: input.low,
    high: input.high,
    unit: input.unit,
    displayLabel: input.displayLabel,
  });
}

/** `copyWith` that cannot produce an invalid range. */
export function updateQuantityRange(
  base: QuantityRange,
  patch: Partial<QuantityRange>,
): Result<QuantityRange, InvalidQuantityRange> {
  return quantityRange({ ...base, ...patch });
}
