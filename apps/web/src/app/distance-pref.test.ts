import { describe, expect, it, vi } from 'vitest';
import { KV_KEYS } from '../storage';
import type { KeyValueStore } from '../storage';
import { DistancePref } from './distance-pref';
import { unlockedBundle } from './testing';

describe('DistancePref', () => {
  it('defaults to OFF, with nothing stored', async () => {
    const { kv } = await unlockedBundle();
    const pref = new DistancePref(kv);
    await pref.load();
    expect(pref.current()).toBe(false);
    expect(await kv.read(KV_KEYS.uiShowDistanceToGuide)).toBeNull();
  });

  it('stores only the on state, and reads it back in a new session', async () => {
    const { kv } = await unlockedBundle();
    const pref = new DistancePref(kv);
    await pref.set(true);
    expect(pref.current()).toBe(true);
    expect(await kv.read(KV_KEYS.uiShowDistanceToGuide)).toBe('on');
    const next = new DistancePref(kv);
    await next.load();
    expect(next.current()).toBe(true);
    await next.set(false);
    expect(await kv.read(KV_KEYS.uiShowDistanceToGuide)).toBeNull();
  });

  it('notifies once per change, not on a repeat', async () => {
    const { kv } = await unlockedBundle();
    const pref = new DistancePref(kv);
    const listener = vi.fn();
    const stop = pref.subscribe(listener);
    await pref.set(true);
    await pref.set(true);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    await pref.set(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('an unreadable store reads as off; a failed write changes nothing', async () => {
    const broken: KeyValueStore = {
      read: () => Promise.reject(new Error('locked')),
      write: () => Promise.reject(new Error('locked')),
      delete: () => Promise.reject(new Error('locked')),
    };
    const pref = new DistancePref(broken);
    await pref.load();
    expect(pref.current()).toBe(false);
    await expect(pref.set(true)).rejects.toThrow();
    expect(pref.current()).toBe(false);
  });

  it('a pulled copy that turned it on is picked up by refresh', async () => {
    const { kv } = await unlockedBundle();
    const pref = new DistancePref(kv);
    await pref.load();
    await kv.write(KV_KEYS.uiShowDistanceToGuide, 'on');
    await pref.refresh();
    expect(pref.current()).toBe(true);
  });
});
