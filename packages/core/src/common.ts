/** An instant as milliseconds since the Unix epoch (UTC). Never a mutable `Date`. */
export type EpochMs = number;

/** The one injectable source of "now". Production wires `systemClock`; tests pass a fixed value. */
export type Clock = () => EpochMs;

export const systemClock: Clock = () => Date.now();

/** Cancels a subscription. Safe to call more than once. */
export type Unsubscribe = () => void;

/** Validation outcome for small factories. Nothing in the core throws across a boundary. */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Copies a list into a frozen one so a plate held by a store snapshot cannot be mutated. */
export function frozenList<T>(items: Iterable<T>): readonly T[] {
  return Object.freeze([...items]);
}
