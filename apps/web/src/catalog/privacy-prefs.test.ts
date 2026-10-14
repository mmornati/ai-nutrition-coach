// The Open Food Facts answer (PV7) in the encrypted kv. Ported from privacy_prefs_test.dart.
import { describe, expect, it } from 'vitest';
import { KV_KEYS, KeyValueStoreLocked, type KeyValueStore } from '../storage/key-value-store';
import { offLookupGate, PrivacyPrefs } from './privacy-prefs';

class MemoryKv implements KeyValueStore {
  readonly map = new Map<string, string>();
  async read(key: string) {
    return this.map.get(key) ?? null;
  }
  async write(key: string, value: string) {
    this.map.set(key, value);
  }
  async delete(key: string) {
    this.map.delete(key);
  }
}

const lockedKv: KeyValueStore = {
  read: async () => null,
  write: async () => {
    throw new KeyValueStoreLocked();
  },
  delete: async () => {
    throw new KeyValueStoreLocked();
  },
};

const throwingKv: KeyValueStore = {
  read: async () => {
    throw new Error('unreadable');
  },
  write: async () => undefined,
  delete: async () => undefined,
};

describe('PrivacyPrefs', () => {
  it('defaults: nothing acknowledged, Open Food Facts not asked yet', async () => {
    const prefs = new PrivacyPrefs(new MemoryKv());
    expect(await prefs.aboutAcknowledged()).toBe(false);
    expect(await prefs.offLookupChoice()).toBe('unasked');
  });

  it('the About notice is acknowledged once, with a UTC timestamp, and survives a new instance', async () => {
    const kv = new MemoryKv();
    const prefs = new PrivacyPrefs(kv, () => new Date(Date.UTC(2026, 9, 12, 8)));
    await prefs.acknowledgeAbout();
    expect(await prefs.aboutAcknowledged()).toBe(true);
    expect(kv.map.get(KV_KEYS.privacyAboutAckAtUtc)).toBe('2026-10-12T08:00:00.000Z');
    expect(await new PrivacyPrefs(kv).aboutAcknowledged()).toBe(true);
  });

  it('the Open Food Facts answer round-trips and can be reset', async () => {
    const kv = new MemoryKv();
    const prefs = new PrivacyPrefs(kv);
    await prefs.setOffLookupChoice('offlineOnly');
    expect(await prefs.offLookupChoice()).toBe('offlineOnly');
    expect(kv.map.get('privacy.offLookup')).toBe('offlineOnly');
    await prefs.setOffLookupChoice('allowed');
    expect(await prefs.offLookupChoice()).toBe('allowed');
    await prefs.setOffLookupChoice('unasked');
    expect(await prefs.offLookupChoice()).toBe('unasked');
    expect(kv.map.has('privacy.offLookup')).toBe(false);
  });

  it('an unknown stored token is "not asked", never consent', async () => {
    const kv = new MemoryKv();
    await kv.write(KV_KEYS.privacyOffLookup, 'yes please');
    expect(await new PrivacyPrefs(kv).offLookupChoice()).toBe('unasked');
  });

  it('locked or unreadable store: reads are the defaults, writes throw', async () => {
    const locked = new PrivacyPrefs(lockedKv);
    expect(await locked.aboutAcknowledged()).toBe(false);
    expect(await locked.offLookupChoice()).toBe('unasked');
    await expect(locked.acknowledgeAbout()).rejects.toBeInstanceOf(KeyValueStoreLocked);
    await expect(locked.setOffLookupChoice('allowed')).rejects.toBeInstanceOf(KeyValueStoreLocked);

    const broken = new PrivacyPrefs(throwingKv);
    expect(await broken.aboutAcknowledged()).toBe(false);
    expect(await broken.offLookupChoice()).toBe('unasked');
  });

  it('toString prints nothing', () => {
    expect(String(new PrivacyPrefs(new MemoryKv()))).toBe('PrivacyPrefs()');
  });
});

describe('offLookupGate', () => {
  it('only an explicit "allowed" opens the gate; unasked, offlineOnly and unreadable stay closed', async () => {
    const kv = new MemoryKv();
    const prefs = new PrivacyPrefs(kv);
    const gate = offLookupGate(prefs);
    expect(await gate()).toBe(false);
    await prefs.setOffLookupChoice('offlineOnly');
    expect(await gate()).toBe(false);
    await prefs.setOffLookupChoice('allowed');
    expect(await gate()).toBe(true);
    expect(await offLookupGate(new PrivacyPrefs(throwingKv))()).toBe(false);
    expect(await offLookupGate(new PrivacyPrefs(lockedKv))()).toBe(false);
  });
});
