import type { DatabaseFood } from '../entities/database-food';
import type { QuantityRange } from './quantity-range';

/** A food entry before the store assigns `id` and `plateLogId`. */
export interface FoodEntryDraft {
  readonly databaseFood: DatabaseFood;
  readonly quantity: QuantityRange;
}
