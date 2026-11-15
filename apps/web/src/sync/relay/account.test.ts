import { describe, expect, it } from 'vitest';
import { decodeBase64Url, RECOVERY_KEY_BYTES } from '@anc/core';
import {
  deriveRecoveryKeys,
  formatRecoveryKey,
  newRecoveryKeyBytes,
  parseRecoveryKey,
  unwrapWithRecovery,
  wrapWithRecovery,
} from './crypto';
import { describeDevice } from './account';

describe('the recovery key', () => {
  it('is 160 bits, written as 8 groups of 4 base32 characters, and reads back', () => {
    const bytes = newRecoveryKeyBytes();
    expect(bytes).toHaveLength(RECOVERY_KEY_BYTES);
    const text = formatRecoveryKey(bytes);
    expect(text).toMatch(/^([A-Z2-7]{4}-){7}[A-Z2-7]{4}$/);
    expect(parseRecoveryKey(text)).toEqual(bytes);
    expect(parseRecoveryKey(text.toLowerCase().replaceAll('-', ' '))).toEqual(bytes);
    expect(parseRecoveryKey(text.slice(0, -1))).toBeNull();
    expect(parseRecoveryKey(text.replace(/^./, '1'))).toBeNull();
    expect(
      new Set(Array.from({ length: 20 }, () => formatRecoveryKey(newRecoveryKeyBytes()))).size,
    ).toBe(20);
  });

  it('derives an auth proof and a KEK that are bound to the handle and separate from each other', async () => {
    const key = newRecoveryKeyBytes();
    const a = await deriveRecoveryKeys('alice', key);
    const b = await deriveRecoveryKeys('alice', key);
    const other = await deriveRecoveryKeys('bobby', key);
    expect(a.authKey).toEqual(b.authKey);
    expect(a.authKey).not.toEqual(other.authKey);
    expect(decodeBase64Url('AA')).not.toBeNull();
    const vaultKey = new Uint8Array(32).fill(7);
    const wrapped = await wrapWithRecovery(a.kek, 'vid', vaultKey);
    expect(await unwrapWithRecovery(b.kek, 'vid', wrapped)).toEqual(vaultKey);
    // Another handle's KEK, or another vault id, does not open it.
    expect(await unwrapWithRecovery(other.kek, 'vid', wrapped)).toBeNull();
    expect(await unwrapWithRecovery(a.kek, 'other-vault', wrapped)).toBeNull();
  });
});

describe('describeDevice', () => {
  it('says the system and the browser, nothing else', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('iPhone · Safari');
    expect(
      describeDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      ),
    ).toBe('Mac · Chrome');
    expect(describeDevice('curl/8')).toBe('');
  });
});
