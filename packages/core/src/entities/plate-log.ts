import { frozenList, type EpochMs } from '../common';
import type { FoodEntry } from './food-entry';

/**
 * The single convergent record for one logged meal. `loggedAtUtc` is the authoritative UTC
 * instant of capture. `entries` is copied into a frozen list. Non-emptiness is enforced by
 * `RecordPlate`, not here, so a store can still hand back an empty snapshot.
 */
export interface PlateLog {
  readonly id: number;
  readonly loggedAtUtc: EpochMs;
  readonly entries: readonly FoodEntry[];
}

export function plateLog(input: {
  readonly id: number;
  readonly loggedAtUtc: EpochMs;
  readonly entries: Iterable<FoodEntry>;
}): PlateLog {
  return {
    id: input.id,
    loggedAtUtc: input.loggedAtUtc,
    entries: frozenList(input.entries),
  };
}
