// The vault snapshot carries only the `kv` keys on the allow-list (packages/core/src/vault/kv-allow-list.ts).
// This ties that list to the keys the app actually defines: a key added to KV_KEYS without a
// decision fails here, instead of silently staying out (or, worse, going in).
import { DEVICE_ONLY_KV_KEYS, isSyncedKvKey, SYNCED_KV_KEYS } from '@anc/core';
import { describe, expect, it } from 'vitest';
import { KV_KEYS } from './key-value-store';
import { DEVICE_ID_KV_KEY } from './vault-clock';

describe('kv keys and the vault allow-list', () => {
  it('every KV_KEYS value is decided: synced or device-only, never both, never neither', () => {
    for (const key of Object.values(KV_KEYS)) {
      const synced = SYNCED_KV_KEYS.includes(key);
      const deviceOnly = DEVICE_ONLY_KV_KEYS.includes(key);
      expect(synced !== deviceOnly, `${key} must be in exactly one list`).toBe(true);
    }
  });

  it('every listed key exists (no stale entries) and the device id key is device-only', () => {
    const known = new Set<string>([...Object.values(KV_KEYS), DEVICE_ID_KV_KEY]);
    for (const key of [...SYNCED_KV_KEYS, ...DEVICE_ONLY_KV_KEYS]) {
      expect(known.has(key), `${key} is not a known kv key`).toBe(true);
    }
    expect(isSyncedKvKey(DEVICE_ID_KV_KEY)).toBe(false);
  });

  it('the BYOK key, the AI settings, every consent to a destination and the device id never sync', () => {
    for (const key of [
      KV_KEYS.privacyOffLookup,
      KV_KEYS.aiByokKey,
      KV_KEYS.aiSettings,
      KV_KEYS.aiCoachingConsent,
      KV_KEYS.aiDescribeConsent,
      DEVICE_ID_KV_KEY,
    ]) {
      expect(isSyncedKvKey(key)).toBe(false);
    }
  });
});
