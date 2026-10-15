// Port of the earlier client: "Erase all local data" closes the store, deletes every
// persisted byte (database pages, the IndexedDB header copy, the localStorage header), returns to
// first run, and names failures; the steps are independent and best-effort.
import { createEraseLocalData, eraseResultEquals, ERASE_SUCCESS } from '@anc/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_HINT_KEY, LOCK_IDLE_MINUTES_KEY, STORE_META_KEY } from './constants';
import { WebLocalDataEraser } from './local-data-eraser';
import type { StoreBundle } from './store-bundle';
import { memfsFileExists } from './testing/node-sqlite';
import { GOOD_PASSPHRASE, realStack, type RealStack } from './testing/stacks';

let stack: RealStack;
beforeEach(() => {
  stack = realStack();
});

async function unlockedStore(): Promise<StoreBundle> {
  const bundle = stack.bundle();
  await bundle.controller.initialize();
  await bundle.controller.createStore(GOOD_PASSPHRASE);
  await bundle.store.recordPlate({
    entries: [
      {
        databaseFood: {
          sourceRef: 'x',
          displayName: 'Apple',
          source: 'manual',
          foodGroup: 'other',
        },
        quantity: { low: 1, high: 1, unit: 'piece', displayLabel: '~1' },
      },
    ],
  });
  stack.storage.write(LOCK_IDLE_MINUTES_KEY, '30');
  stack.storage.write('anc.pwa.web.leftover', 'x');
  stack.storage.write('someone.else', 'keep');
  return bundle;
}

describe('WebLocalDataEraser', () => {
  it('erases the database, the header copy, the header and every owned leftover, and returns to first run', async () => {
    const bundle = await unlockedStore();
    expect(await memfsFileExists(stack.filename)).toBe(true);

    const result = await bundle.eraser.eraseAll();

    expect(result).toEqual(ERASE_SUCCESS);
    expect(await memfsFileExists(stack.filename)).toBe(false);
    expect(stack.headerCopy.value).toBeNull();
    expect(stack.storage.read(STORE_META_KEY)).toBeNull();
    expect(stack.storage.ownedKeys()).toEqual([]);
    expect(stack.storage.read('someone.else')).toBe('keep'); // not ours: untouched
    expect(bundle.controller.database()).toBeNull();
    expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation');
    expect(stack.lock.isHeld).toBe(false);
    bundle.dispose();
  });

  it('removes the plaintext language hint with everything else', async () => {
    const bundle = await unlockedStore();
    stack.storage.write(LOCALE_HINT_KEY, 'fr');
    expect(await bundle.eraser.eraseAll()).toEqual(ERASE_SUCCESS);
    expect(stack.storage.read(LOCALE_HINT_KEY)).toBeNull();
    bundle.dispose();
  });

  it('deletes only the new app names: the earlier web build on the same origin is left alone', async () => {
    const bundle = await unlockedStore();
    stack.storage.write('ai_nutrition_coach.web.store.meta', 'old header');
    stack.storage.write('ai_nutrition_coach.web.lock.idleMinutes', '30');
    expect((await bundle.eraser.eraseAll()).kind).toBe('eraseLocalDataSuccess');
    expect(stack.storage.read('ai_nutrition_coach.web.store.meta')).toBe('old header');
    expect(stack.storage.read('ai_nutrition_coach.web.lock.idleMinutes')).toBe('30');
    expect(stack.storage.read(STORE_META_KEY)).toBeNull();
    bundle.dispose();
  });

  it('is also the recovery path for a forgotten passphrase (works while locked)', async () => {
    const first = await unlockedStore();
    await first.controller.lock();
    const bundle = stack.bundle();
    await bundle.controller.initialize();
    expect(bundle.controller.getSnapshot().status).toBe('locked');
    expect(await bundle.eraser.eraseAll()).toEqual(ERASE_SUCCESS);
    expect(await memfsFileExists(stack.filename)).toBe(false);
    expect(bundle.controller.getSnapshot().status).toBe('needsPassphraseCreation');
  });

  it('works on an already-empty device (nothing to delete)', async () => {
    const bundle = stack.bundle();
    await bundle.controller.initialize();
    expect(await bundle.eraser.eraseAll()).toEqual(ERASE_SUCCESS);
  });

  it('a failing step is reported but does not skip the others', async () => {
    const bundle = await unlockedStore();
    stack.pool.failRemove = true;
    const result = await bundle.eraser.eraseAll();
    expect(
      eraseResultEquals(result, { kind: 'eraseLocalDataFailure', failedSteps: ['databaseFiles'] }),
    ).toBe(true);
    // The independent step still ran.
    expect(stack.storage.read('anc.pwa.web.leftover')).toBeNull();
    // Data first, then header: a half-finished erase leaves a database that is still recoverable.
    expect(await memfsFileExists(stack.filename)).toBe(true);
    expect(stack.headerCopy.value).not.toBeNull();
    expect(stack.storage.read(STORE_META_KEY)).not.toBeNull(); // the sweep spared the header
    expect(bundle.controller.getSnapshot().status).toBe('locked');
  });

  it('names closeStore and secureStorage failures independently', async () => {
    const bundle = await unlockedStore();
    vi.spyOn(bundle.controller, 'prepareForErase').mockRejectedValueOnce(new Error('x'));
    vi.spyOn(stack.storage, 'ownedKeys').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const result = await bundle.eraser.eraseAll();
    expect(result.kind).toBe('eraseLocalDataFailure');
    if (result.kind === 'eraseLocalDataFailure') {
      expect([...result.failedSteps].sort()).toEqual(['closeStore', 'secureStorage']);
    }
    expect(await memfsFileExists(stack.filename)).toBe(false); // the database step still succeeded
  });

  it('through the use case: a typed result, never throws', async () => {
    const bundle = await unlockedStore();
    const erase = createEraseLocalData(bundle.eraser);
    expect(await erase()).toEqual(ERASE_SUCCESS);
    const broken = createEraseLocalData(
      new WebLocalDataEraser(
        {
          prepareForErase: () => Promise.reject(new Error('x')),
          eraseStore: () => Promise.reject(new Error('x')),
          initialize: () => Promise.reject(new Error('x')),
        } as never,
        stack.storage,
      ),
    );
    const result = await broken();
    expect(result.kind).toBe('eraseLocalDataFailure');
  });
});
