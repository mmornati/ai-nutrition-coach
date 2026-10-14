/**
 * A minimal FIFO async mutex. Serialises read-modify-write sequences over an async store (the
 * encrypted store has no cross-call transactions) so two concurrent callers cannot both read the
 * same value and lose an update.
 */
export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  /**
   * Runs `action` after every previously queued action has finished, whether they succeeded or
   * threw. The result or error of `action` is returned to the caller; a failure never blocks the
   * queue.
   */
  synchronized<T>(action: () => Promise<T>): Promise<T> {
    const run = this.tail.then(action);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
