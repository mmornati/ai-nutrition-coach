import type { QuantityRange } from '../value-types/quantity-range';
import type { DatabaseFood } from './database-food';

/** A resolved food on a plate. `plateLogId` is the back-reference to the parent `PlateLog`. */
export interface FoodEntry {
  readonly id: number;
  readonly plateLogId: number;
  readonly databaseFood: DatabaseFood;
  readonly quantity: QuantityRange;
}
