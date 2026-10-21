import { describe, expect, it, vi } from 'vitest';
import { EU_REFERENCE_INTAKES } from '@anc/core';
import { KV_KEYS } from '../storage';
import type { KeyValueStore } from '../storage';
import { ProfilePref } from './profile-pref';
import { unlockedBundle } from './testing';
import { serializePlatesToJson } from '../export';

const FULL = { sex: 'female', ageBand: '30-49', activity: 'moderate' } as const;

describe('ProfilePref', () => {
  it('defaults to no profile and the EU reference intakes, with nothing stored', async () => {
    const { kv } = await unlockedBundle();
    const pref = new ProfilePref(kv);
    await pref.load();
    expect(pref.current()).toBeUndefined();
    expect(pref.targets()).toBe(EU_REFERENCE_INTAKES);
    expect(pref.personal()).toBe(false);
    expect(await kv.read(KV_KEYS.profile)).toBeNull();
  });

  it('keeps the profile in the encrypted store and reads it back in a new session', async () => {
    const { kv } = await unlockedBundle();
    const pref = new ProfilePref(kv);
    await pref.set({ ...FULL, goal: 'lose', allergies: ['peanut'] });
    expect(JSON.parse((await kv.read(KV_KEYS.profile)) ?? '{}')).toEqual({
      ...FULL,
      goal: 'lose',
      allergies: ['peanut'],
    });
    const next = new ProfilePref(kv);
    await next.load();
    expect(next.current()?.goal).toBe('lose');
    expect(next.personal()).toBe(true);
    expect(next.targets().energyKcal).toBe(1800);
  });

  it('targets are stable between changes and notify once per change', async () => {
    const { kv } = await unlockedBundle();
    const pref = new ProfilePref(kv);
    const listener = vi.fn();
    pref.subscribe(listener);
    await pref.set(FULL);
    await pref.set(FULL);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(pref.targets()).toBe(pref.targets());
    await pref.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(pref.targets()).toBe(EU_REFERENCE_INTAKES);
    expect(await kv.read(KV_KEYS.profile)).toBeNull();
  });

  it('drops unknown fields and treats a malformed row as no profile', async () => {
    const { kv } = await unlockedBundle();
    const pref = new ProfilePref(kv);
    await pref.set({ ...FULL, ...({ name: 'Ada' } as object) });
    expect(await kv.read(KV_KEYS.profile)).not.toContain('Ada');
    await kv.write(KV_KEYS.profile, '{not json');
    const next = new ProfilePref(kv);
    await next.load();
    expect(next.current()).toBeUndefined();
  });

  it('an unreadable store reads as no profile, and a failed write changes nothing', async () => {
    const broken: KeyValueStore = {
      read: () => Promise.reject(new Error('locked')),
      write: () => Promise.reject(new Error('locked')),
      delete: () => Promise.reject(new Error('locked')),
    };
    const pref = new ProfilePref(broken);
    await pref.load();
    expect(pref.current()).toBeUndefined();
    await expect(pref.set(FULL)).rejects.toThrow();
    expect(pref.current()).toBeUndefined();
  });

  it('is erased by "Erase all local data"', async () => {
    const bundle = await unlockedBundle();
    await new ProfilePref(bundle.kv).set(FULL);
    await bundle.eraser.eraseAll();
    await bundle.controller.initialize();
    await bundle.controller.createStore('a long enough passphrase');
    expect(await bundle.kv.read(KV_KEYS.profile)).toBeNull();
  });

  it('goes into the JSON export under a `profile` key, and only when set', () => {
    const decoded = JSON.parse(serializePlatesToJson([], FULL)) as Record<string, unknown>;
    expect(Object.keys(decoded)).toEqual(['plates', 'profile']);
    expect(decoded['profile']).toEqual(FULL);
    expect(Object.keys(JSON.parse(serializePlatesToJson([])) as object)).toEqual(['plates']);
  });
});
