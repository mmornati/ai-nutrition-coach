import { describe, expect, it } from 'vitest';
import { STORE_LOCK_NAME } from './constants';
import { InMemoryStoreLock, WebLocksStoreLock, type LockManagerLike } from './locks';

/** A faithful single-name stand-in for `navigator.locks.request(name, {ifAvailable: true}, cb)`. */
class FakeLockManager implements LockManagerLike {
  readonly requested: { name: string; ifAvailable: boolean }[] = [];
  private held = new Set<string>();

  async request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => Promise<unknown> | unknown,
  ): Promise<unknown> {
    this.requested.push({ name, ifAvailable: options.ifAvailable });
    if (this.held.has(name)) return callback(null);
    this.held.add(name);
    try {
      return await callback({ name });
    } finally {
      this.held.delete(name);
    }
  }
}

describe('the Web Locks store lock', () => {
  it('uses the documented lock name with ifAvailable', async () => {
    const manager = new FakeLockManager();
    const handle = await new WebLocksStoreLock(manager).tryAcquire();
    expect(manager.requested).toEqual([{ name: 'anc-pwa-store', ifAvailable: true }]);
    expect(STORE_LOCK_NAME).toBe('anc-pwa-store');
    handle?.release();
  });

  it('refuses a second holder until the first releases (the browser also frees it if the tab dies)', async () => {
    const manager = new FakeLockManager();
    const lock = new WebLocksStoreLock(manager);
    const first = await lock.tryAcquire();
    expect(first).not.toBeNull();
    expect(await lock.tryAcquire()).toBeNull();
    first?.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const again = await lock.tryAcquire();
    expect(again).not.toBeNull();
    again?.release();
  });

  it('release is idempotent', async () => {
    const lock = new WebLocksStoreLock(new FakeLockManager());
    const handle = await lock.tryAcquire();
    handle?.release();
    handle?.release();
  });

  it('degrades to "not enforced" without the Web Locks API (never a lock-out)', async () => {
    const lock = new WebLocksStoreLock(null);
    const a = await lock.tryAcquire();
    const b = await lock.tryAcquire();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
  });

  it('degrades the same way if the lock request itself errors', async () => {
    const broken: LockManagerLike = { request: () => Promise.reject(new Error('denied')) };
    expect(await new WebLocksStoreLock(broken).tryAcquire()).not.toBeNull();
  });
});

describe('the in-memory store lock', () => {
  it('is exclusive and reusable after release', async () => {
    const lock = new InMemoryStoreLock();
    const handle = await lock.tryAcquire();
    expect(lock.isHeld).toBe(true);
    expect(await lock.tryAcquire()).toBeNull();
    handle?.release();
    handle?.release();
    expect(lock.isHeld).toBe(false);
    expect(await lock.tryAcquire()).not.toBeNull();
  });
});
