import type { DatabaseFood } from '../entities/database-food';
import type { QuantityRange } from '../value-types/quantity-range';

export interface FoodMatch {
  readonly food: DatabaseFood;
  readonly confidence: number;
  readonly presets: readonly QuantityRange[];
}

/**
 * Why a catalog lookup failed (the earlier `CatalogFailure.reason` was an untyped object; these are
 * the causes its barcode adapter produces). Plain data: structured-clone safe.
 */
export type CatalogFailureReason =
  'barcodeUnsupported' | 'network' | 'timeout' | 'httpError' | 'invalidResponse' | 'unknown';

export type CatalogResult =
  | { readonly kind: 'rankedMatches'; readonly matches: readonly FoodMatch[] }
  | { readonly kind: 'notFound'; readonly query: string }
  | {
      readonly kind: 'catalogFailure';
      readonly reason: CatalogFailureReason;
      readonly message?: string;
    };

export const rankedMatches = (matches: readonly FoodMatch[]): CatalogResult => ({
  kind: 'rankedMatches',
  matches,
});
export const notFound = (query: string): CatalogResult => ({ kind: 'notFound', query });
export const catalogFailure = (reason: CatalogFailureReason, message?: string): CatalogResult =>
  message === undefined
    ? { kind: 'catalogFailure', reason }
    : { kind: 'catalogFailure', reason, message };
