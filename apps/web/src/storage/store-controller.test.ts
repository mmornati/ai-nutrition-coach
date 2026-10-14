// Port of the earlier client: the create / unlock / lock / erase logic against REAL
// sqlite3mc encryption through the production worker protocol, with an in-memory file system
// standing in for OPFS, an in-memory map for localStorage and the IndexedDB header copy, and an
// in-memory stand-in for the Web Lock. "Reloading the page" is building a new controller over the
// same storage, header copy and file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenRequest, StoreBackend } from './backend';
import {
  DATABASE_FILENAME,
  HEADER_DB_NAME,
  IDLE_MINUTE_CHOICES,
  LOCK_IDLE_MINUTES_KEY,
  OPFS_POOL_DIRECTORY,
  OPFS_VFS_NAME,
  STORAGE_KEY_PREFIX,
  STORE_LOCK_NAME,
  STORE_META_KEY,
} from './constants';
import {
  classifyOpenError,
  LOCKED_FAILURE,
  mapStoreError,
  SchemaTooNewError,
  SessionClosedError,
  StoreUnavailableError,
} from './errors';
import { parseStoreMeta } from './header';
import type { StoreDb } from './ops';
import { InMemoryMetaStorage, type MetaStorage } from './meta-storage';
import type { StoreBundle } from './store-bundle';
import {
  memfsDelete,
  memfsFileExists,
  openRawKeyed,
  plainReadFailureCode,
  testKey,
} from './testing/node-sqlite';
import {
  GOOD_PASSPHRASE as GOOD,
  realStack,
  WRONG_PASSPHRASE as WRONG,
  type RealStack,
} from './testing/stacks';
import { StoreController, type StoreStatus } from './store-controller';
import { syncOp, type FoodEntryDraft } from '@anc/core';
import { InMemorySyncQueue, scopeSyncQueueToSession } from '../sync';

class SpyBackend implements StoreBackend {
  openCalls = 0;
  eraseCalls = 0;
  failOpen: Error | null = null;
  failErase = false;
  requests: OpenRequest[] = [];
  closeGate: Promise<void> | null = null;
  constructor(private readonly inner: StoreBackend) {}
  exists = () => this.inner.exists();
  onSessionLost = (listener: () => void) => this.inner.onSessionLost?.(listener);
  readHeaderCopy = () => this.inner.readHeaderCopy();
  writeHeaderCopy = (h: string) => this.inner.writeHeaderCopy(h);
  async open(request: OpenRequest): Promise<StoreDb> {
    this.openCalls++;
    this.requests.push(request);
    if (this.failOpen) throw this.failOpen;
    const db = await this.inner.open(request);
    const gate = () => this.closeGate;
    return {
      ...db,
      close: async () => {
        await gate();
        await db.close();
      },
    };
  }
  async erase(): Promise<void> {
    this.eraseCalls++;
    if (this.failErase) throw new Error('erase refused');
    await this.inner.erase();
  }
}

class ThrowingStorage implements MetaStorage {
  read(): string | null {
    throw new Error('SecurityError');
  }
  write(): void {
    throw new Error('SecurityError');
  }
  remove(): void {
    throw new Error('SecurityError');
  }
  ownedKeys(): string[] {
    throw new Error('SecurityError');
  }
}

const draft = (name: string): FoodEntryDraft => ({
  databaseFood: {
    sourceRef: `manual:${name}`,
    displayName: name,
    source: 'manual',
    foodGroup: 'other',
  },
  quantity: { low: 1, high: 2, unit: 'piece', displayLabel: '~1-2 pieces' },
});

let stack: RealStack;
let spies: SpyBackend[];
let bundles: StoreBundle[];
let now: number;

const build = (overrides: Parameters<RealStack['bundle']>[0] = {}): StoreBundle => {
  const bundle = stack.bundle({ clock: () => now, ...overrides });
  bundles.push(bundle);
  return bundle;
};
const spy = () => spies.at(-1) as SpyBackend;
const statusOf = (b: StoreBundle): StoreStatus => b.controller.getSnapshot().status;
const metaOf = () => {
  const read = parseStoreMeta(stack.storage.read(STORE_META_KEY), 1000);
  if (read.kind !== 'present') throw new Error('no header');
  return read.meta;
};

beforeEach(() => {
  stack = realStack();
  spies = [];
  bundles = [];
  now = Date.UTC(2026, 9, 1, 12);
  stack.backendWrapper = (b) => {
    const s = new SpyBackend(b);
    spies.push(s);
    return s;
  };
});

afterEach(async () => {
  vi.useRealTimers();
  for (const b of bundles) {
    await b.controller.lock();
    b.dispose();
  }
});

async function created(over: Parameters<RealStack['bundle']>[0] = {}): Promise<StoreBundle> {
  const b = build(over);
  await b.controller.initialize();
  expect(await b.controller.createStore(GOOD)).toEqual({ kind: 'unlocked' });
  return b;
}
async function reloaded(over: Parameters<RealStack['bundle']>[0] = {}): Promise<StoreBundle> {
  const b = build(over);
  await b.controller.initialize();
  return b;
}
const platesOf = async (b: StoreBundle) => {
  const r = await b.store.readRange();
  if (r.kind !== 'platesRead') throw new Error('read failed');
  return r.plates;
};

describe('first run', () => {
  it('no header -> needsPassphraseCreation, nothing opened', async () => {
    const c = build();
    expect(statusOf(c)).toBe('checking');
    await c.controller.initialize();
    expect(statusOf(c)).toBe('needsPassphraseCreation');
    expect(c.controller.database()).toBeNull();
    expect(spy().openCalls).toBe(0);
  });

  it('a weak passphrase is rejected without touching storage', async () => {
    const c = await reloaded();
    expect(await c.controller.createStore('short')).toEqual({
      kind: 'passphraseRejected',
      issue: 'tooShort',
    });
    expect(await c.controller.createStore('aaaaaaaaaaaaaaaa')).toEqual({
      kind: 'passphraseRejected',
      issue: 'tooRepetitive',
    });
    expect(stack.storage.values.size).toBe(0);
    expect(spy().openCalls).toBe(0);
    expect(statusOf(c)).toBe('needsPassphraseCreation');
  });

  it('creating persists a random per-store salt + KDF params + version, only after the keyed database opened', async () => {
    const c = await created();
    expect(statusOf(c)).toBe('unlocked');
    const meta = metaOf();
    expect(meta.salt).toHaveLength(16);
    expect(meta.kdf).toEqual({ name: 'pbkdf2-hmac-sha256', iterations: 1000 });
    expect(meta.version).toBe(1);
    // The IndexedDB copy is the same header.
    expect(stack.headerCopy.value).toBe(stack.storage.read(STORE_META_KEY));
  });

  it('two stores get different salts', async () => {
    const a = await created();
    const saltA = [...metaOf().salt];
    await a.eraser.eraseAll();
    const b = await reloaded();
    expect(await b.controller.createStore(GOOD)).toEqual({ kind: 'unlocked' });
    expect([...metaOf().salt]).not.toEqual(saltA);
  });

  it('a failed creation leaves no header (next run starts clean) and cleans up what it left behind', async () => {
    const c = await reloaded();
    spy().failOpen = new StoreUnavailableError('storage');
    expect(await c.controller.createStore(GOOD)).toEqual({
      kind: 'storeUnavailable',
      reason: 'storage',
    });
    expect(stack.storage.values.size).toBe(0);
    expect(stack.headerCopy.value).toBeNull();
    expect(statusOf(c)).toBe('needsPassphraseCreation');
    expect(c.controller.database()).toBeNull();
    expect(spy().eraseCalls).toBe(1);
    expect(stack.lock.isHeld).toBe(false);
  });

  it('a header that cannot be written leaves nothing behind either', async () => {
    const c = await reloaded();
    vi.spyOn(stack.storage, 'write').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect((await c.controller.createStore(GOOD)).kind).toBe('storeUnavailable');
    expect(stack.headerCopy.value).toBeNull();
    expect(await memfsFileExists(stack.filename)).toBe(false);
    expect(stack.lock.isHeld).toBe(false);
  });

  it('data present but header missing -> needsReset, never a silent wipe', async () => {
    const first = await created();
    await first.controller.lock();
    stack.storage.values.clear();
    stack.headerCopy.value = null; // both header copies gone
    const c = await reloaded();
    expect(statusOf(c)).toBe('needsReset');
    expect(await memfsFileExists(stack.filename)).toBe(true);
    expect((await c.controller.createStore(GOOD)).kind).toBe('storeUnavailable');
    expect(await memfsFileExists(stack.filename)).toBe(true);
  });

  it('creating over an orphaned database never wipes it; the explicit erase starts clean', async () => {
    const first = await created();
    await first.controller.lock();
    stack.storage.values.clear();
    stack.headerCopy.value = null;
    const c = await reloaded();
    expect(statusOf(c)).toBe('needsReset');
    expect(spy().eraseCalls).toBe(0);
    expect((await c.eraser.eraseAll()).kind).toBe('eraseLocalDataSuccess');
    expect(await memfsFileExists(stack.filename)).toBe(false);
    expect(statusOf(c)).toBe('needsPassphraseCreation');
    expect(await c.controller.createStore('a new passphrase 1')).toEqual({ kind: 'unlocked' });
  });

  it('a header lost from localStorage is recovered from the IndexedDB copy and the store still unlocks', async () => {
    const first = await created();
    await first.store.recordPlate({ entries: [draft('Kept')] });
    await first.controller.lock();
    stack.storage.values.delete(STORE_META_KEY);
    const c = await reloaded();
    expect(statusOf(c)).toBe('locked');
    expect(stack.storage.values.has(STORE_META_KEY)).toBe(true);
    expect(await c.controller.unlock(GOOD)).toEqual({ kind: 'unlocked' });
    expect((await platesOf(c))[0]?.entries[0]?.databaseFood.displayName).toBe('Kept');
  });
});

describe('encryption and persistence', () => {
  it('the file is not a readable plaintext SQLite database', async () => {
    const c = await created();
    await c.store.recordPlate({ entries: [draft('Apple')] });
    await c.controller.lock();
    expect(await plainReadFailureCode(stack.filename)).toBe(26);
  });

  it('data persists across a simulated reload and the right passphrase opens it', async () => {
    const c1 = await created();
    const r = await c1.store.recordPlate({ entries: [draft('Apple')] });
    expect(r.kind).toBe('recordPlateSuccess');
    await c1.controller.lock();

    const c2 = await reloaded();
    expect(statusOf(c2)).toBe('locked');
    expect(c2.controller.database()).toBeNull();
    expect(await c2.controller.unlock(GOOD)).toEqual({ kind: 'unlocked' });
    const plates = await platesOf(c2);
    expect(plates).toHaveLength(1);
    expect(plates[0]?.entries[0]?.databaseFood.displayName).toBe('Apple');
  });

  it('coach notes live in the same encrypted database and persist; a locked store answers typed failures', async () => {
    const c1 = await created();
    const plate = await c1.store.recordPlate({ entries: [draft('Pear')] });
    if (plate.kind !== 'recordPlateSuccess') throw new Error('record failed');
    const note = {
      id: 0,
      plateLogId: plate.plateLog.id,
      anchor: 'postResolve' as const,
      questionKey: 'post.resolve.vegLight',
      text: 'A handful of greens would round this out.',
      generatedAt: Date.UTC(2026, 9, 1),
    };
    expect((await c1.notes.append(note)).kind).toBe('coachNoteAppended');
    await c1.controller.lock();

    const locked = await c1.notes.append(note);
    expect(locked).toMatchObject({
      kind: 'coachNoteAppendFailure',
      cause: { reason: 'webSessionKey' },
    });
    expect(await c1.notes.forPlate(plate.plateLog.id)).toEqual([]);

    const c2 = await reloaded();
    await c2.controller.unlock(GOOD);
    const reread = await c2.notes.forPlate(plate.plateLog.id);
    expect(reread[0]?.text).toBe('A handful of greens would round this out.');
  });

  it('the AI settings and BYOK key live inside the encrypted store and survive a reload', async () => {
    const c1 = await created();
    await c1.kv.write('ai.byokKey', 'sk-test-abcdef123456');
    await c1.kv.write('ai.settings', '{"rung":"byok"}');
    await c1.controller.lock();
    expect(await c1.kv.read('ai.byokKey')).toBeNull(); // locked: nothing known, not "gone"
    await expect(c1.kv.write('ai.byokKey', 'x')).rejects.toMatchObject({
      name: 'KeyValueStoreLocked',
    });
    // Never in any browser storage.
    expect([...stack.storage.values.values()].join()).not.toContain('sk-test');
    expect(stack.headerCopy.value).not.toContain('sk-test');
    const c2 = await reloaded();
    await c2.controller.unlock(GOOD);
    expect(await c2.kv.read('ai.byokKey')).toBe('sk-test-abcdef123456');
    expect(await c2.kv.read('ai.settings')).toBe('{"rung":"byok"}');
  });
});

describe('wrong passphrase', () => {
  it('can never open the store, retains nothing, and the right one still works', async () => {
    const c1 = await created();
    await c1.store.recordPlate({ entries: [draft('A')] });
    await c1.controller.lock();

    const c2 = await reloaded();
    const outcome = await c2.controller.unlock(WRONG);
    expect(outcome).toEqual({ kind: 'wrongPassphrase', retryAfterMs: 0 });
    expect(statusOf(c2)).toBe('locked');
    expect(c2.controller.database()).toBeNull();
    expect((await c2.store.recordPlate({ entries: [draft('x')] })).kind).toBe('storeFailure');

    expect(await c2.controller.unlock(GOOD)).toEqual({ kind: 'unlocked' });
    expect(await platesOf(c2)).toHaveLength(1);
  });

  it('an empty passphrase is just a wrong passphrase', async () => {
    const c1 = await created();
    await c1.controller.lock();
    const c2 = await reloaded();
    expect((await c2.controller.unlock('')).kind).toBe('wrongPassphrase');
    expect(c2.controller.database()).toBeNull();
  });

  it('a returning user cannot "create" over an existing store', async () => {
    const c1 = await created();
    await c1.controller.lock();
    const c2 = await reloaded();
    expect((await c2.controller.createStore(GOOD)).kind).toBe('storeUnavailable');
    expect(statusOf(c2)).toBe('locked');
  });

  it('a failed attempt zeroes the passphrase bytes and releases the tab lock', async () => {
    const c1 = await created();
    await c1.controller.lock();
    const c2 = await reloaded();
    await c2.controller.unlock(WRONG);
    expect(spy().requests).toHaveLength(1);
    expect(spy().requests[0]?.passphrase.every((b) => b === 0)).toBe(true);
    expect(stack.lock.isHeld).toBe(false);
  });
});

describe('lock', () => {
  it('flips status and drops the database BEFORE awaiting the close', async () => {
    const c = await created();
    let release = () => {};
    spy().closeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const closing = c.controller.lock();
    // Still closing, but the UI is already off the data.
    expect(statusOf(c)).toBe('locked');
    expect(c.controller.database()).toBeNull();
    expect((await c.store.readRange()).kind).toBe('platesReadFailed');
    expect(stack.lock.isHeld).toBe(true); // another tab may only take over after the close
    release();
    await closing;
    expect(stack.lock.isHeld).toBe(false);
  });

  it('notifies once, answers typed failures, emits nothing, and is idempotent', async () => {
    const c = await created();
    const statuses: StoreStatus[] = [];
    c.controller.subscribe(() => statuses.push(statusOf(c)));
    await c.controller.lock();
    expect(statuses).toEqual(['locked']);
    const r = await c.store.recordPlate({ entries: [draft('x')] });
    expect(r).toMatchObject({ kind: 'storeFailure', reason: 'webSessionKey' });
    const seen: unknown[] = [];
    const stop = c.store.watchRange(
      { from: 0, to: 1e15 },
      {
        next: (v) => seen.push(v),
        error: (e) => seen.push(e),
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    stop();
    expect(seen).toEqual([]);
    await c.controller.lock();
    expect(statuses).toEqual(['locked']);
  });

  it('terminates the engine session: the database handle is closed and gone', async () => {
    const c = await created();
    const db = c.controller.database();
    expect(db).not.toBeNull();
    await c.controller.lock();
    await expect(db?.kvGet('x')).rejects.toBeDefined();
  });

  it('unlock and lock notify the controller (what the gate listens to)', async () => {
    const c1 = await created();
    await c1.controller.lock();
    const c = await reloaded();
    const seen: StoreStatus[] = [];
    c.controller.subscribe(() => {
      if (seen.at(-1) !== statusOf(c)) seen.push(statusOf(c));
    });
    await c.controller.unlock(GOOD);
    await c.controller.lock();
    expect(seen).toEqual(['unlocked', 'locked']);
  });

  it('the snapshot is stable between changes (useSyncExternalStore-safe) and carries no secrets', async () => {
    const c = await created();
    const a = c.controller.getSnapshot();
    expect(c.controller.getSnapshot()).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect(c.controller.toString()).toBe('StoreController(unlocked)');
    expect(JSON.stringify(a)).not.toContain(GOOD);
  });
});

describe('auto-lock', () => {
  const minutes = (n: number) => n * 60_000;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  it('idle timeout locks; touch() pushes the deadline out', async () => {
    const c = await created();
    expect(c.controller.idleTimeoutMs).toBe(minutes(15));
    await vi.advanceTimersByTimeAsync(minutes(10));
    now += minutes(10);
    c.controller.touch();
    await vi.advanceTimersByTimeAsync(minutes(10));
    expect(c.controller.isUnlocked).toBe(true); // touch re-armed the timer
    await vi.advanceTimersByTimeAsync(minutes(6));
    expect(statusOf(c)).toBe('locked');
    expect(c.controller.database()).toBeNull();
  });

  it('touch() is cheap: it re-arms at most once per second', async () => {
    const c = await created();
    const arm = vi.spyOn(globalThis, 'setTimeout');
    c.controller.touch(); // same instant as the unlock
    now += 500;
    c.controller.touch();
    expect(arm).not.toHaveBeenCalled();
    now += 600;
    c.controller.touch();
    expect(arm).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('hidden longer than the limit locks on return; shorter does not', async () => {
    const c = await created();
    c.controller.onHidden();
    now += minutes(1);
    c.controller.onVisible();
    expect(c.controller.isUnlocked).toBe(true);

    c.controller.onHidden();
    now += minutes(5);
    c.controller.onVisible();
    await vi.advanceTimersByTimeAsync(0);
    expect(statusOf(c)).toBe('locked');
  });

  it('idle deadline passed while timers were throttled -> lock on visible', async () => {
    const c = await created();
    now += minutes(15) + 1000;
    c.controller.onVisible();
    await vi.advanceTimersByTimeAsync(0);
    expect(statusOf(c)).toBe('locked');
  });

  it('a hidden page locks by TIMER, without ever becoming visible', async () => {
    const c = await created({ hiddenLockMs: 80 });
    c.controller.onHidden();
    expect(c.controller.isUnlocked).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(statusOf(c)).toBe('locked');
  });

  it('becoming visible in time cancels the hidden timer', async () => {
    const c = await created({ hiddenLockMs: 80 });
    c.controller.onHidden();
    c.controller.onVisible();
    await vi.advanceTimersByTimeAsync(200);
    expect(c.controller.isUnlocked).toBe(true);
  });

  it('idle minutes are clamped to the offered choices (5/15/30/60)', async () => {
    expect([...IDLE_MINUTE_CHOICES]).toEqual([5, 15, 30, 60]);
    const c = await created();
    c.controller.setIdleMinutes(17);
    expect(c.controller.getSnapshot().idleMinutes).toBe(15);
    c.controller.setIdleMinutes(500);
    expect(c.controller.getSnapshot().idleMinutes).toBe(60);
    c.controller.setIdleMinutes(0);
    expect(c.controller.getSnapshot().idleMinutes).toBe(60);
    stack.storage.write(LOCK_IDLE_MINUTES_KEY, '1');
    const c2 = await reloaded();
    expect(c2.controller.getSnapshot().idleMinutes).toBe(5);
  });

  it('the idle setting persists, is reloaded, and a lowered delay re-arms the running timer', async () => {
    const c = await created();
    expect(c.controller.getSnapshot().idleMinutes).toBe(15);
    c.controller.setIdleMinutes(30);
    expect(stack.storage.read(LOCK_IDLE_MINUTES_KEY)).toBe('30');
    const c2 = await reloaded();
    expect(c2.controller.getSnapshot().idleMinutes).toBe(30);
    await c2.controller.unlock(GOOD).catch(() => undefined); // c (still open) holds the tab lock
    await c.controller.lock();
    await c2.controller.unlock(GOOD);
    c2.controller.setIdleMinutes(5);
    await vi.advanceTimersByTimeAsync(minutes(6));
    expect(statusOf(c2)).toBe('locked');
  });

  it('a browser that refuses to persist the setting still applies it for this session', async () => {
    const c = await created();
    vi.spyOn(stack.storage, 'write').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    c.controller.setIdleMinutes(5);
    expect(c.controller.getSnapshot().idleMinutes).toBe(5);
  });

  it('locking cancels the timers (nothing fires after a lock)', async () => {
    const c = await created();
    c.controller.onHidden();
    await c.controller.lock();
    await vi.advanceTimersByTimeAsync(minutes(30));
    expect(statusOf(c)).toBe('locked');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('throttling (UX friction only)', () => {
  it('repeated failures block attempts until the delay passes; success resets', async () => {
    const c1 = await created();
    await c1.controller.lock();
    const c = await reloaded();
    for (let i = 0; i < 2; i++) {
      expect((await c.controller.unlock(WRONG)).kind).toBe('wrongPassphrase');
    }
    expect(await c.controller.unlock(WRONG)).toEqual({
      kind: 'wrongPassphrase',
      retryAfterMs: 1000,
    });
    const opensBefore = spy().openCalls;
    const blocked = await c.controller.unlock(GOOD);
    expect(blocked.kind).toBe('throttled');
    expect(spy().openCalls).toBe(opensBefore); // no attempt was made

    now += 2000;
    expect(await c.controller.unlock(GOOD)).toEqual({ kind: 'unlocked' });
    await c.controller.lock();
    expect((await c.controller.unlock(WRONG)).kind).toBe('wrongPassphrase');
    expect(await c.controller.unlock(WRONG)).toEqual({ kind: 'wrongPassphrase', retryAfterMs: 0 }); // counter was reset
  });

  it('a second concurrent attempt is throttled, not run in parallel', async () => {
    const c1 = await created();
    await c1.controller.lock();
    const c = await reloaded();
    const [a, b] = await Promise.all([c.controller.unlock(GOOD), c.controller.unlock(GOOD)]);
    expect([a.kind, b.kind].sort()).toEqual(['throttled', 'unlocked']);
  });
});

describe('erase and start over', () => {
  it('eraseStore deletes the database and the header; next start is a first run', async () => {
    const c = await created();
    await c.store.recordPlate({ entries: [draft('A')] });
    const statuses: StoreStatus[] = [];
    c.controller.subscribe(() => statuses.push(statusOf(c)));
    await c.controller.eraseStore();
    expect(statuses).toEqual(['erasing']);
    expect(await memfsFileExists(stack.filename)).toBe(false);
    expect(stack.storage.values.has(STORE_META_KEY)).toBe(false);
    expect(stack.headerCopy.value).toBeNull();
    expect(c.controller.database()).toBeNull();

    const fresh = await reloaded();
    expect(statusOf(fresh)).toBe('needsPassphraseCreation');
    expect(await fresh.controller.createStore('a new passphrase 1')).toEqual({ kind: 'unlocked' });
    expect(await platesOf(fresh)).toEqual([]);
  });

  it('works from the locked state (forgotten passphrase)', async () => {
    const c1 = await created();
    await c1.controller.lock();
    const c = await reloaded();
    expect(statusOf(c)).toBe('locked');
    await c.controller.eraseStore();
    expect(await memfsFileExists(stack.filename)).toBe(false);
    await c.controller.initialize();
    expect(statusOf(c)).toBe('needsPassphraseCreation');
  });

  it('a failed erase keeps the header, rethrows and re-derives the status', async () => {
    const c = await created();
    spy().failErase = true;
    await expect(c.controller.eraseStore()).rejects.toThrow();
    expect(stack.storage.values.has(STORE_META_KEY)).toBe(true);
    expect(statusOf(c)).toBe('locked');
    expect(stack.lock.isHeld).toBe(false);
  });

  it('is refused while another tab holds the store', async () => {
    const tabA = await created();
    const tabB = await reloaded();
    await expect(tabB.controller.eraseStore()).rejects.toThrow();
    expect(await memfsFileExists(stack.filename)).toBe(true);
    expect(tabA.controller.isUnlocked).toBe(true);
  });
});

describe('untrustworthy storage', () => {
  it('a corrupt header -> needsReset', async () => {
    stack.storage.write(STORE_META_KEY, '{"v":1');
    expect(statusOf(await reloaded())).toBe('needsReset');
  });

  it('storage that refuses reads is NOT mistaken for a first run, nor for a lost store: it is unavailable', async () => {
    const c = build({ storage: new ThrowingStorage() });
    await c.controller.initialize();
    expect(statusOf(c)).toBe('unavailable');
    expect(c.controller.getSnapshot().unavailableReason).toBe('storageRefused');
    expect(c.controller.database()).toBeNull();
  });

  it('header present but database gone -> data missing, needsReset, no empty store is minted', async () => {
    const c1 = await created();
    await c1.controller.lock();
    await memfsDelete(stack.filename);
    const c = await reloaded();
    expect(await c.controller.unlock(GOOD)).toEqual({ kind: 'dataMissing' });
    expect(statusOf(c)).toBe('needsReset');
    expect(c.controller.database()).toBeNull();
    expect(await memfsFileExists(stack.filename)).toBe(false);
  });

  it('a header below the iteration floor is refused', async () => {
    const c1 = await created();
    await c1.controller.lock();
    // Default floor (600k): the 1000-iteration header above is a downgrade.
    const strict = build({ minIterations: 600_000 });
    await strict.controller.initialize();
    expect(statusOf(strict)).toBe('needsReset');
  });

  it('a failed header-copy read does not become a first run: it is unavailable (storageRefused)', async () => {
    stack.headerCopy.read = () => Promise.reject(new Error('IDB blocked'));
    const c = await reloaded();
    expect(statusOf(c)).toBe('unavailable');
    expect(c.controller.getSnapshot().unavailableReason).toBe('storageRefused');
  });

  it('a recovered header that localStorage then refuses to keep is unavailable, not lost', async () => {
    const first = await created();
    await first.controller.lock();
    stack.storage.values.delete(STORE_META_KEY);
    vi.spyOn(stack.storage, 'write').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const c = await reloaded();
    expect(statusOf(c)).toBe('unavailable');
    expect(c.controller.getSnapshot().unavailableReason).toBe('storageRefused');
  });
});

describe('an unreadable browser is "unavailable" (retry), never "needsReset" (erase)', () => {
  const unavailableReason = (b: StoreBundle) => b.controller.getSnapshot().unavailableReason;

  it('no OPFS (private mode / old browser): the probe says so before anything is read', async () => {
    const probe = vi.fn(() => Promise.resolve('noOpfs' as const));
    const c = await reloaded({ probe });
    expect(statusOf(c)).toBe('unavailable');
    expect(unavailableReason(c)).toBe('noOpfs');
    expect(probe).toHaveBeenCalledTimes(1);
    expect(spy().openCalls).toBe(0);
  });

  it('plain HTTP (insecure context) is unavailable with its own reason', async () => {
    const c = await reloaded({ probe: () => Promise.resolve('insecureContext') });
    expect(statusOf(c)).toBe('unavailable');
    expect(unavailableReason(c)).toBe('insecureContext');
  });

  it('runs the real probe by default (honouring isSecureContext)', async () => {
    const controller = new StoreController({
      storage: stack.storage,
      backend: stack.makeBackend(),
      lock: stack.lock,
      isSecureContext: () => false,
    });
    await controller.initialize();
    expect(controller.getSnapshot().status).toBe('unavailable');
    expect(controller.getSnapshot().unavailableReason).toBe('insecureContext');
    controller.dispose();
  });

  it('a probe that throws is a browser that cannot run the store', async () => {
    const c = await reloaded({ probe: () => Promise.reject(new Error('boom')) });
    expect(statusOf(c)).toBe('unavailable');
    expect(unavailableReason(c)).toBe('noOpfs');
  });

  it.each([
    ['another tab holds the files', new StoreUnavailableError('inUse'), 'inUse'],
    ['a transient OPFS failure', new StoreUnavailableError('transient'), 'transient'],
    ['an untyped inspection failure', new Error('unknown transient reason'), 'transient'],
  ] as const)(
    'OPFS inspection failing (%s) is unavailable/%s, the data untouched',
    async (_n, error, reason) => {
      const first = await created();
      await first.store.recordPlate({ entries: [draft('Kept')] });
      await first.controller.lock();
      stack.storage.values.clear();
      stack.headerCopy.value = null;
      stack.pool.exists = () => Promise.reject(error);
      const c = await reloaded();
      expect(statusOf(c)).toBe('unavailable');
      expect(unavailableReason(c)).toBe(reason);
      expect(await memfsFileExists(stack.filename)).toBe(true);
      expect(spy().eraseCalls).toBe(0);
    },
  );

  it('in this state create and unlock answer storeUnavailable with the reason, touching nothing', async () => {
    const c = await reloaded({ probe: () => Promise.resolve('noOpfs') });
    expect(await c.controller.createStore(GOOD)).toEqual({
      kind: 'storeUnavailable',
      reason: 'noOpfs',
    });
    expect(await c.controller.unlock(GOOD)).toEqual({ kind: 'storeUnavailable', reason: 'noOpfs' });
    expect(spy().openCalls).toBe(0);
    expect(stack.storage.values.size).toBe(0);
  });

  it('retry() looks again: once the storage can be read the real state is derived', async () => {
    const first = await created();
    await first.controller.lock();
    let broken = true;
    const read = stack.headerCopy.read.bind(stack.headerCopy);
    stack.storage.values.delete(STORE_META_KEY);
    stack.headerCopy.read = () => (broken ? Promise.reject(new Error('IDB blocked')) : read());
    const c = await reloaded();
    expect(statusOf(c)).toBe('unavailable');
    const seen: string[] = [];
    c.controller.subscribe(() => seen.push(statusOf(c)));
    broken = false;
    await c.controller.retry();
    expect(seen).toContain('checking'); // the stale reason is not shown while looking again
    expect(statusOf(c)).toBe('locked');
    expect(c.controller.getSnapshot().unavailableReason).toBeNull();
    expect(await c.controller.unlock(GOOD)).toEqual({ kind: 'unlocked' });
  });

  it('retry() stays unavailable (new reason) while the problem persists, and is a no-op elsewhere', async () => {
    let probeResult: 'noOpfs' | 'ok' = 'noOpfs';
    const c = await reloaded({ probe: () => Promise.resolve(probeResult) });
    await c.controller.retry();
    expect(statusOf(c)).toBe('unavailable');
    probeResult = 'ok';
    await c.controller.retry();
    expect(statusOf(c)).toBe('needsPassphraseCreation');

    const open = await created();
    await open.controller.retry();
    expect(statusOf(open)).toBe('unlocked');
    expect(open.controller.database()).not.toBeNull();
  });

  it('needsReset is reserved for positively bad content: orphaned data, a corrupt header', async () => {
    const first = await created();
    await first.controller.lock();
    stack.storage.values.clear();
    stack.headerCopy.value = null;
    expect(statusOf(await reloaded())).toBe('needsReset');
    stack.storage.write(STORE_META_KEY, '{"v":1');
    const corrupt = await reloaded();
    expect(statusOf(corrupt)).toBe('needsReset');
    expect(corrupt.controller.getSnapshot().unavailableReason).toBeNull();
  });
});

describe('outcomes are distinct', () => {
  it('storage unavailable (private mode / no OPFS / missing wasm) is never a wrong passphrase', async () => {
    const c1 = await created();
    await c1.controller.lock();
    const c = await reloaded();
    for (const reason of ['noOpfs', 'engineMissing', 'storage'] as const) {
      spy().failOpen = new StoreUnavailableError(reason);
      expect(await c.controller.unlock(GOOD)).toEqual({ kind: 'storeUnavailable', reason });
    }
    spy().failOpen = null;
    // None of those counted as a failure: the first wrong passphrase is not throttled.
    expect(await c.controller.unlock(WRONG)).toEqual({ kind: 'wrongPassphrase', retryAfterMs: 0 });
    expect(await c.controller.unlock(WRONG)).toEqual({ kind: 'wrongPassphrase', retryAfterMs: 0 });
    expect(await c.controller.unlock(GOOD)).toEqual({ kind: 'unlocked' });
  });

  it('plain HTTP at create time (the context changed after start) says so, touching nothing', async () => {
    let secure = true;
    const c = await reloaded({ isSecureContext: () => secure });
    secure = false;
    expect(await c.controller.createStore(GOOD)).toEqual({
      kind: 'storeUnavailable',
      reason: 'insecureContext',
    });
    expect(spy().openCalls).toBe(0);
    expect(stack.lock.isHeld).toBe(false);
    expect(stack.storage.values.size).toBe(0);
  });

  it('data written by a NEWER version: locked, "reload to update", not counted as a wrong passphrase', async () => {
    const c1 = await created();
    await c1.controller.lock();
    const key = await testKey(GOOD, metaOf().salt);
    const raw = await openRawKeyed(stack.filename, key);
    raw.run('PRAGMA user_version = 9');
    raw.close();

    const c = await reloaded();
    for (let i = 0; i < 5; i++) {
      expect(await c.controller.unlock(GOOD)).toEqual({ kind: 'newerVersion' });
    }
    expect(statusOf(c)).toBe('locked');
    expect(c.controller.database()).toBeNull();
    expect(stack.lock.isHeld).toBe(false);
    expect(classifyOpenError(new SchemaTooNewError(9, 1))).toEqual({ kind: 'newerVersion' });
  });

  it('asks for durable storage once after create/unlock and reports the answer, without nagging', async () => {
    const asked = vi.fn(() => Promise.resolve('notPersisted' as const));
    const c = await created({ requestDurable: asked });
    await vi.waitFor(() => expect(c.controller.getSnapshot().durable).toBe('notPersisted'));
    expect(asked).toHaveBeenCalledTimes(1);
    await c.controller.lock();
    await c.controller.unlock(GOOD);
    expect(asked).toHaveBeenCalledTimes(1);
  });
});

describe('two tabs (Web Lock)', () => {
  it("a second tab cannot open or create while the first holds the lock, and a create never wipes the first tab's store", async () => {
    const tabB = await reloaded();
    expect(statusOf(tabB)).toBe('needsPassphraseCreation');
    const tabA = await created();
    await tabA.store.recordPlate({ entries: [draft('InTabA')] });

    expect(await tabB.controller.createStore('tab b passphrase 1')).toEqual({
      kind: 'inUseElsewhere',
    });
    expect(spy().eraseCalls).toBe(0);
    expect(await memfsFileExists(stack.filename)).toBe(true);

    // Tab A locks; B's stale create now finds the real header and refuses, moving B to unlock.
    await tabA.controller.lock();
    expect((await tabB.controller.createStore('tab b passphrase 1')).kind).toBe('storeUnavailable');
    expect(statusOf(tabB)).toBe('locked');

    // And A's data is intact for B with the right passphrase.
    expect(await tabB.controller.unlock(GOOD)).toEqual({ kind: 'unlocked' });
    expect((await platesOf(tabB))[0]?.entries[0]?.databaseFood.displayName).toBe('InTabA');
  });

  it('unlock in a second tab is refused while the first is open, then works after it locks', async () => {
    const tabA = await created();
    const tabB = await reloaded();
    expect(await tabB.controller.unlock(GOOD)).toEqual({ kind: 'inUseElsewhere' });
    expect(statusOf(tabB)).toBe('locked');
    expect(tabB.controller.database()).toBeNull();
    await tabA.controller.lock();
    expect(await tabB.controller.unlock(GOOD)).toEqual({ kind: 'unlocked' });
    // And now A is the one that is locked out.
    expect(await tabA.controller.unlock(GOOD)).toEqual({ kind: 'inUseElsewhere' });
    await tabB.controller.lock();
    expect(await tabA.controller.unlock(GOOD)).toEqual({ kind: 'unlocked' });
  });

  it('a failed unlock releases the lock', async () => {
    const c1 = await created();
    await c1.controller.lock();
    const c = await reloaded();
    await c.controller.unlock(WRONG);
    expect(stack.lock.isHeld).toBe(false);
  });
});

describe('passphrase normalisation (NFC, UTF-8)', () => {
  it('composed and decomposed forms open the same store', async () => {
    const c1 = build();
    await c1.controller.initialize();
    expect(await c1.controller.createStore('café au lait 123')).toEqual({ kind: 'unlocked' });
    await c1.controller.lock();
    const c2 = await reloaded();
    expect(await c2.controller.unlock('café au lait 123')).toEqual({ kind: 'unlocked' });
  });
});

describe('a plain InMemoryMetaStorage is what the header lives in', () => {
  it('uses the documented, renamed keys', () => {
    expect(STORE_META_KEY).toBe('anc.pwa.store.meta');
    expect(LOCK_IDLE_MINUTES_KEY).toBe('anc.pwa.lock.idleMinutes');
    expect(new InMemoryMetaStorage().ownedKeys()).toEqual([]);
  });

  it('every browser storage name is new-app only, so it can never collide with the earlier build', () => {
    expect(STORE_META_KEY).toMatch(/^anc\.pwa\./);
    expect(LOCK_IDLE_MINUTES_KEY).toMatch(/^anc\.pwa\./);
    expect(STORAGE_KEY_PREFIX).toBe('anc.pwa.');
    expect(HEADER_DB_NAME).toBe('anc_pwa_header_v1');
    expect(STORE_LOCK_NAME).toBe('anc-pwa-store');
    expect(OPFS_POOL_DIRECTORY).toBe('.anc_pwa_store');
    for (const name of [
      STORE_META_KEY,
      LOCK_IDLE_MINUTES_KEY,
      HEADER_DB_NAME,
      STORE_LOCK_NAME,
      OPFS_POOL_DIRECTORY,
      OPFS_VFS_NAME,
      DATABASE_FILENAME,
    ]) {
      expect(name).not.toContain('ai_nutrition_coach');
      expect(name).not.toContain('ai-nutrition-coach');
    }
  });
});

describe('a worker that dies on its own', () => {
  it('locks the store: status locked, handle dropped, lock released, typed locked failures', async () => {
    const c = await created();
    const db = c.controller.database();
    expect(db).not.toBeNull();
    stack.ports.at(-1)?.onerror?.(new Event('error'));
    await vi.waitFor(() => expect(statusOf(c)).toBe('locked'));
    expect(c.controller.database()).toBeNull();
    await vi.waitFor(() => expect(stack.lock.isHeld).toBe(false));
    // The store facade answers the locked failure...
    const recorded = await c.store.recordPlate({ entries: [draft('Late')] });
    expect(recorded).toEqual(LOCKED_FAILURE);
    // ...and so does an operation on the dead session through a handle taken earlier.
    const stale = db?.insertPlate('2026-01-01T00:00:00.000Z', []);
    await expect(stale).rejects.toBeInstanceOf(SessionClosedError);
    expect(mapStoreError(await stale?.catch((e: unknown) => e))).toEqual(LOCKED_FAILURE);
    // The person can unlock again with a fresh worker.
    expect(await c.controller.unlock(GOOD)).toEqual({ kind: 'unlocked' });
  });

  it('operations on the session after a normal lock are the locked failure, not a storage error', async () => {
    const c = await created();
    const db = c.controller.database();
    await c.controller.lock();
    const late = db?.kvGet('x');
    await expect(late).rejects.toBeInstanceOf(SessionClosedError);
    expect(mapStoreError(await late?.catch((e: unknown) => e))).toEqual(LOCKED_FAILURE);
  });
});

describe('the sync outbox follows the unlocked session', () => {
  it('is cleared on a lock and on an erase of the real controller', async () => {
    const c = build();
    const queue = new InMemorySyncQueue();
    const stop = scopeSyncQueueToSession(c.controller, queue);
    await c.controller.initialize();
    expect(await c.controller.createStore(GOOD)).toEqual({ kind: 'unlocked' });
    const op = (opId: string) =>
      syncOp({ opId, plateLogId: 1, enqueuedAtUtc: 1, kind: 'plateLogCreated' });

    await queue.enqueue(op('a'));
    expect(await queue.pending()).toHaveLength(1);
    await c.controller.lock();
    expect(await queue.pending()).toEqual([]);

    expect(await c.controller.unlock(GOOD)).toEqual({ kind: 'unlocked' });
    await queue.enqueue(op('b'));
    expect(await queue.pending()).toHaveLength(1);
    await c.controller.lock();
    expect(await queue.pending()).toEqual([]);

    await queue.enqueue(op('c'));
    expect((await c.eraser.eraseAll()).kind).toBe('eraseLocalDataSuccess');
    expect(await queue.pending()).toEqual([]);
    stop();
  });
});

describe('dispose', () => {
  it('closes the worker first and releases the Web Lock only after the close settled', async () => {
    const c = await created();
    let release: () => void = () => undefined;
    spy().closeGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    c.dispose();
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The close is still pending: another tab must not be able to take over yet.
    expect(stack.lock.isHeld).toBe(true);
    release();
    await vi.waitFor(() => expect(stack.lock.isHeld).toBe(false));
  });

  it('with nothing open it just releases', async () => {
    const c = await reloaded();
    c.dispose();
    expect(stack.lock.isHeld).toBe(false);
  });
});
