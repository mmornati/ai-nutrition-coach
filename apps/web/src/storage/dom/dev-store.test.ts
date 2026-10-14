// The dev-only unencrypted in-memory store: behind an explicit dev flag, with a visible banner.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../create-app-store';
import { DEV_STORE_BANNER_TEXT } from '../dev/dev-store';

afterEach(() => {
  vi.unstubAllEnvs();
  document.body.replaceChildren();
});

describe('the dev memory store', () => {
  it('is NOT used unless VITE_DEV_MEMORY_STORE=1 (no banner, the real controller waits to initialise)', async () => {
    const bundle = await createAppStore();
    expect(document.querySelector('[data-dev-store-banner]')).toBeNull();
    expect(bundle.controller.getSnapshot().status).toBe('checking');
    bundle.dispose();
  });

  it('shows a visible "DEV, not encrypted" banner when the flag is set in a dev build', async () => {
    vi.stubEnv('VITE_DEV_MEMORY_STORE', '1');
    const bundle = await createAppStore();
    const banner = document.querySelector('[data-dev-store-banner]');
    expect(banner?.textContent).toBe('DEV, not encrypted');
    expect(DEV_STORE_BANNER_TEXT).toBe('DEV, not encrypted');
    expect(banner?.getAttribute('role')).toBe('status');
    bundle.dispose();
  });

  it('behaves like a store: create, write, lock, unlock, read, erase', async () => {
    vi.stubEnv('VITE_DEV_MEMORY_STORE', '1');
    const { controller, store, eraser } = await createAppStore();
    await controller.initialize();
    expect(controller.getSnapshot().status).toBe('needsPassphraseCreation');
    expect(await controller.createStore('any passphrase will do')).toEqual({ kind: 'unlocked' });
    await store.recordPlate({
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
    await controller.lock();
    expect((await store.readRange()).kind).toBe('platesReadFailed');
    expect((await controller.unlock('whatever')).kind).toBe('unlocked');
    const read = await store.readRange();
    expect(read.kind === 'platesRead' && read.plates).toHaveLength(1);
    expect((await eraser.eraseAll()).kind).toBe('eraseLocalDataSuccess');
    expect(controller.getSnapshot().status).toBe('needsPassphraseCreation');
  });
});
