import type { StoreFailure } from '../results/store';

/**
 * Push-style stream for store watchers: values, or a typed failure. Nothing else is thrown.
 *
 * Contract for every `watch*` method: it emits the current value once, asynchronously after
 * subscribe, then on every change; emitted snapshots are immutable (frozen).
 */
export interface StoreObserver<T> {
  next(value: T): void;
  error(failure: StoreFailure): void;
}
