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
    // No height and no weight: a deficit needs a known BMI, so the guide is held at maintenance.
    expect(next.targets().energyKcal).toBe(2000);
    expect(next.guide().explanation.notice).toBe('bodyUnknown');
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

  it('a read that fails when a pulled copy is refreshed keeps the profile, and is not to be saved over', async () => {
    const { kv } = await unlockedBundle();
    const pref = new ProfilePref(kv);
    await pref.set({ ...FULL, allergies: ['peanut'] });
    expect(pref.trusted()).toBe(true);
    let fail = true;
    const flaky: KeyValueStore = {
      read: (key) => (fail ? Promise.reject(new Error('busy')) : kv.read(key)),
      write: kv.write.bind(kv),
      delete: kv.delete.bind(kv),
    };
    const live = new ProfilePref(flaky);
    fail = false;
    await live.load();
    fail = true;
    await live.refresh();
    expect(live.current()?.allergies).toEqual(['peanut']);
    expect(live.trusted()).toBe(false);
    fail = false;
    await live.refresh();
    expect(live.trusted()).toBe(true);
    expect(live.current()?.sex).toBe('female');
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

  it("the daily guide follows the latest weigh-in, and a new one replaces the day's, and is read back in a new session", async () => {
    const { kv, measurements } = await unlockedBundle();
    const pref = new ProfilePref(kv, measurements);
    await pref.set({ ...FULL, heightCm: 165 });
    const before = pref.targets().energyKcal;
    expect(pref.guide().explanation.equation).toBe('referenceWeight');
    const t = Date.parse('2026-08-16T07:00:00.000Z');
    await pref.record('weight', 80, t, '2026-08-16');
    expect(pref.latest('weight')?.value).toBe(80);
    expect(pref.guide().explanation.equation).toBe('weightHeight');
    expect(pref.targets().energyKcal).toBeGreaterThan(before);
    await pref.record('weight', 60, t + 3_600_000, '2026-08-16'); // the same day: replaces
    expect(pref.measurementList()).toHaveLength(1);
    expect(pref.latest('weight')?.value).toBe(60);
    const next = new ProfilePref(kv, measurements);
    await next.load();
    expect(next.latest('weight')?.value).toBe(60);
    expect(next.targets()).toEqual(pref.targets());
    await next.removeMeasurement('weight', '2026-08-16');
    expect(next.guide().explanation.equation).toBe('referenceWeight');
  });

  it('notifies once per change, also for a measurement, and clear / removeAllMeasurements do one thing each', async () => {
    const { kv, measurements } = await unlockedBundle();
    const pref = new ProfilePref(kv, measurements);
    const listener = vi.fn();
    pref.subscribe(listener);
    await pref.set(FULL);
    await pref.record('weight', 70, Date.now());
    await pref.record('waist', 80, Date.now());
    expect(listener).toHaveBeenCalledTimes(3);
    await pref.clear();
    expect(pref.current()).toBeUndefined();
    expect(pref.measurementList()).toHaveLength(2); // the answers only
    expect(await kv.read(KV_KEYS.profile)).toBeNull();
    await pref.removeAllMeasurements();
    expect(pref.measurementList()).toEqual([]);
    const listed = await measurements.list();
    expect(listed.kind === 'measurement' && listed.value).toEqual([]);
  });

  it('removeAllMeasurements goes through the store: a row this device has not refreshed yet goes too, with a tombstone', async () => {
    const { kv, measurements, vault } = await unlockedBundle();
    const pref = new ProfilePref(kv, measurements);
    await pref.record('weight', 70, Date.now());
    expect(pref.measurementList()).toHaveLength(1);
    // Another device's weigh-in arrives (here: written straight to the store), the cache is stale.
    await measurements.record({
      kind: 'weight',
      value: 71,
      measuredAtUtc: Date.now() - 86_400_000,
      day: '2020-01-01',
    });
    await measurements.record({ kind: 'waist', value: 80, measuredAtUtc: Date.now() });
    expect(pref.measurementList()).toHaveLength(1);
    await pref.removeAllMeasurements();
    const listed = await measurements.list();
    expect(listed.kind === 'measurement' && listed.value).toEqual([]);
    const read = await vault.readSnapshot();
    expect(read.kind === 'vault' && read.value.tombstones.map((t) => t.table)).toEqual([
      'body_measurement',
      'body_measurement',
      'body_measurement',
    ]);
    expect(pref.measurementList()).toEqual([]);
  });

  it('a measurement that cannot be kept throws and changes nothing', async () => {
    const { kv, measurements } = await unlockedBundle();
    const pref = new ProfilePref(kv, measurements);
    await expect(pref.record('weight', 5, Date.now())).rejects.toThrow(); // under 20 kg
    expect(pref.measurementList()).toEqual([]);
  });

  it('is erased, with every measurement, by "Erase all local data"', async () => {
    const bundle = await unlockedBundle();
    await bundle.measurements.record({ kind: 'weight', value: 70, measuredAtUtc: Date.now() });
    await bundle.eraser.eraseAll();
    await bundle.controller.initialize();
    await bundle.controller.createStore('a long enough passphrase');
    const listed = await bundle.measurements.list();
    expect(listed.kind === 'measurement' && listed.value).toEqual([]);
  });
});
