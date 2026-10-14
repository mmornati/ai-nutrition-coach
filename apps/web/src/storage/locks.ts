// Cross-tab exclusion for the store.
//
// Two tabs of the same origin share one OPFS directory and one header. Without exclusion, tab B
// could create over (and wipe) a store tab A is using. A tab therefore holds an exclusive lock from
// create/unlock until it locks or closes. Production is the Web Locks API (`navigator.locks`),
// which the browser releases automatically when the tab dies. A browser without Web Locks degrades
// to "not enforced" (documented in ADR-0005) rather than locking the user out.

import { STORE_LOCK_NAME } from './constants';

export interface StoreLockHandle {
  /** Release the lock. Idempotent. */
  release(): void;
}

export interface StoreLock {
  /** Try to take the exclusive lock WITHOUT waiting. `null` = held elsewhere. */
  tryAcquire(): Promise<StoreLockHandle | null>;
}

/** The slice of `LockManager` the store uses (so tests can inject a fake). */
export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => Promise<unknown> | unknown,
  ): Promise<unknown>;
}

const NOOP_HANDLE: StoreLockHandle = Object.freeze({ release: () => undefined });

export class WebLocksStoreLock implements StoreLock {
  constructor(
    private readonly locks: LockManagerLike | null = globalThis.navigator?.locks ?? null,
  ) {}

  tryAcquire(): Promise<StoreLockHandle | null> {
    const locks = this.locks;
    if (!locks) return Promise.resolve(NOOP_HANDLE);
    return new Promise((resolve) => {
      let releaseHeld: () => void = () => undefined;
      const held = new Promise<void>((done) => {
        releaseHeld = done;
      });
      // The request promise settles when the lock is released (or on error).
      locks
        .request(STORE_LOCK_NAME, { ifAvailable: true }, (lock) => {
          if (lock === null) {
            resolve(null);
            return undefined;
          }
          let released = false;
          resolve({
            release: () => {
              if (released) return;
              released = true;
              releaseHeld();
            },
          });
          return held;
        })
        .catch(() => resolve(NOOP_HANDLE));
    });
  }
}

/** Single-process stand-in for the browser's lock manager (two controllers play two tabs). */
export class InMemoryStoreLock implements StoreLock {
  private held = false;

  get isHeld(): boolean {
    return this.held;
  }

  tryAcquire(): Promise<StoreLockHandle | null> {
    if (this.held) return Promise.resolve(null);
    this.held = true;
    let released = false;
    return Promise.resolve({
      release: () => {
        if (released) return;
        released = true;
        this.held = false;
      },
    });
  }
}
