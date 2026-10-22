import type { EpochMs } from '../common';
import type { DatabaseFood } from '../entities/database-food';
import type { PlateLog } from '../entities/plate-log';
import { addCalendarDays, startOfLocalDay } from './calendar-day';
import type { QuantityRange } from './quantity-range';

/** One food as the person has been logging it: the last quantity used, how often, and when. */
export interface FoodUse {
  readonly food: DatabaseFood;
  /** The quantity of the most recent time it was logged. */
  readonly quantity: QuantityRange;
  readonly lastAtUtc: EpochMs;
  /** Plates that held it (twice on one plate counts once). */
  readonly count: number;
}

export const RECENT_LIMIT = 10;
export const OFTEN_LIMIT = 10;
export const OFTEN_WINDOW_DAYS = 30;
/** A food has to turn up at least this often to be called "often". */
export const OFTEN_MIN_COUNT = 2;

/** The identity of a food across plates: its catalog and its verbatim reference. */
export const foodKey = (food: DatabaseFood): string => `${food.source}\u0000${food.sourceRef}`;

/**
 * Fold plates into one `FoodUse` per distinct food. Order of the input does not matter: the most
 * recent plate (then the highest id) decides the quantity and the snapshot; within a plate the
 * last entry of a food wins.
 */
export function foodUses(plates: readonly PlateLog[]): FoodUse[] {
  const newestFirst = [...plates].sort((a, b) => b.loggedAtUtc - a.loggedAtUtc || b.id - a.id);
  const byKey = new Map<string, FoodUse>();
  for (const plate of newestFirst) {
    const seenOnPlate = new Set<string>();
    for (const entry of [...plate.entries].reverse()) {
      const key = foodKey(entry.databaseFood);
      const known = byKey.get(key);
      const first = !seenOnPlate.has(key);
      seenOnPlate.add(key);
      if (known === undefined) {
        byKey.set(key, {
          food: entry.databaseFood,
          quantity: entry.quantity,
          lastAtUtc: plate.loggedAtUtc,
          count: 1,
        });
      } else if (first) {
        byKey.set(key, { ...known, count: known.count + 1 });
      }
    }
  }
  return [...byKey.values()];
}

const byName = (a: FoodUse, b: FoodUse): number =>
  a.food.displayName.localeCompare(b.food.displayName);

/** The last `limit` distinct foods, most recent first. */
export function recentFoods(
  plates: readonly PlateLog[],
  limit: number = RECENT_LIMIT,
): readonly FoodUse[] {
  return foodUses(plates)
    .sort((a, b) => b.lastAtUtc - a.lastAtUtc || byName(a, b))
    .slice(0, Math.max(0, limit));
}

/**
 * The foods logged most over the last `days` calendar days (today included), by count, then by
 * recency. Only foods seen at least `minCount` times: one-offs are not "often".
 */
export function frequentFoods(
  plates: readonly PlateLog[],
  options: {
    readonly now: EpochMs;
    readonly limit?: number;
    readonly days?: number;
    readonly minCount?: number;
  },
): readonly FoodUse[] {
  const days = options.days ?? OFTEN_WINDOW_DAYS;
  const since = addCalendarDays(startOfLocalDay(options.now), -(days - 1));
  const minCount = options.minCount ?? OFTEN_MIN_COUNT;
  return foodUses(plates.filter((p) => p.loggedAtUtc >= since))
    .filter((u) => u.count >= minCount)
    .sort((a, b) => b.count - a.count || b.lastAtUtc - a.lastAtUtc || byName(a, b))
    .slice(0, Math.max(0, options.limit ?? OFTEN_LIMIT));
}
