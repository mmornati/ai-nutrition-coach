import { describe, expect, it, vi } from 'vitest';
import { KV_KEYS } from '../storage';
import type { KeyValueStore } from '../storage';
import { NumbersPref } from './numbers-pref';
import { unlockedBundle } from './testing';

describe('NumbersPref', () => {
  it('defaults to shown, with nothing stored', async () => {
    const { kv } = await unlockedBundle();
    const pref = new NumbersPref(kv);
    await pref.load();
    expect(pref.current()).toBe(true);
    expect(await kv.read(KV_KEYS.uiShowNumbers)).toBeNull();
  });

  it('stores only the off state, and reads it back in a new session', async () => {
    const { kv } = await unlockedBundle();
    const pref = new NumbersPref(kv);
    await pref.set(false);
    expect(pref.current()).toBe(false);
    expect(await kv.read(KV_KEYS.uiShowNumbers)).toBe('off');

    const next = new NumbersPref(kv);
    await next.load();
    expect(next.current()).toBe(false);

    await next.set(true);
    expect(await kv.read(KV_KEYS.uiShowNumbers)).toBeNull();
  });

  it('notifies subscribers once per change and not on a repeat', async () => {
    const { kv } = await unlockedBundle();
    const pref = new NumbersPref(kv);
    const listener = vi.fn();
    const stop = pref.subscribe(listener);
    await pref.set(false);
    await pref.set(false);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    await pref.set(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('an unreadable store reads as shown, and a failed write changes nothing', async () => {
    const broken: KeyValueStore = {
      read: () => Promise.reject(new Error('locked')),
      write: () => Promise.reject(new Error('locked')),
      delete: () => Promise.reject(new Error('locked')),
    };
    const pref = new NumbersPref(broken);
    await pref.load();
    expect(pref.current()).toBe(true);
    await expect(pref.set(false)).rejects.toThrow();
    expect(pref.current()).toBe(true);
  });
});
