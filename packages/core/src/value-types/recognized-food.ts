import type { DatabaseFood } from '../entities/database-food';
import type { QuantityRange } from './quantity-range';

/** One food an `AiRung` recognised: the food, a confidence in [0, 1] and a quantity preset. */
export interface RecognizedFood {
  readonly databaseFood: DatabaseFood;
  readonly confidence: number;
  readonly quantity: QuantityRange;
}
