import { describe, expect, it } from 'vitest';
import { decodeBase64Url, encodeBase64Url, type VaultSnapshot } from '@anc/core';
import { at, seedPlate, unlockedBundle } from '../../app/testing';
import { fastKdf } from '../vault/testing';
import {
  derivePassphraseKeys,
  importVaultKey,
  newVaultKeyBytes,
  openSnapshot,
  sealSnapshot,
  unwrapVaultKey,
  wrapVaultKey,
} from './crypto';

const SALT = new Uint8Array(16).fill(3);
const VAULT_ID = encodeBase64Url(new Uint8Array(16).fill(9));

const snapshotWithSalmon = async (): Promise<VaultSnapshot> => {
  const bundle = await unlockedBundle();
  await seedPlate(bundle, at(12, 0), [['Salmon', 'protein']]);
  const read = await bundle.vault.readSnapshot();
  if (read.kind !== 'vault') throw new Error('read');
  return read.value;
};

describe('passphrase keys', () => {
  it('derives the same keys from the same passphrase and salt, and different ones otherwise', async () => {
    const a = await derivePassphraseKeys(fastKdf, 'correct horse battery', SALT);
    const b = await derivePassphraseKeys(fastKdf, 'correct horse battery', SALT);
    const c = await derivePassphraseKeys(fastKdf, 'correct horse battery!', SALT);
    const d = await derivePassphraseKeys(fastKdf, 'correct horse battery', new Uint8Array(16));
    expect(a.authKey).toHaveLength(32);
    expect(b.authKey).toEqual(a.authKey);
    expect(c.authKey).not.toEqual(a.authKey);
    expect(d.authKey).not.toEqual(a.authKey);
  });

  it('the proof sent to the relay is not the wrapping key: one cannot open the other’s wrap', async () => {
    const keys = await derivePassphraseKeys(fastKdf, 'correct horse battery', SALT);
    const wrapped = await wrapVaultKey(keys.kek, VAULT_ID, new Uint8Array(32).fill(1));
    // The auth key bytes used as a key-encryption key do not open it.
    const asKey = await crypto.subtle.importKey(
      'raw',
      keys.authKey as BufferSource,
      'AES-GCM',
      false,
      ['decrypt'],
    );
    expect(await unwrapVaultKey(asKey, VAULT_ID, wrapped)).toBeNull();
  });

  it('a KDF that cannot run rejects (it is never a wrong key)', async () => {
    await expect(
      derivePassphraseKeys(
        () => Promise.reject(new Error('no worker')),
        'correct horse battery',
        SALT,
      ),
    ).rejects.toThrow();
    await expect(
      derivePassphraseKeys(() => Promise.resolve(new Uint8Array(5)), 'correct horse battery', SALT),
    ).rejects.toThrow();
  });
});

describe('the wrapped vault key', () => {
  it('round-trips, is 60 bytes and is different every time (a fresh nonce)', async () => {
    const { kek } = await derivePassphraseKeys(fastKdf, 'correct horse battery', SALT);
    const key = newVaultKeyBytes();
    const one = await wrapVaultKey(kek, VAULT_ID, key);
    const two = await wrapVaultKey(kek, VAULT_ID, key);
    expect(decodeBase64Url(one)).toHaveLength(60);
    expect(one).not.toBe(two);
    expect(await unwrapVaultKey(kek, VAULT_ID, one)).toEqual(key);
  });

  it('does not open under another passphrase, for another vault, or when a byte is changed', async () => {
    const { kek } = await derivePassphraseKeys(fastKdf, 'correct horse battery', SALT);
    const other = await derivePassphraseKeys(fastKdf, 'another passphrase', SALT);
    const wrapped = await wrapVaultKey(kek, VAULT_ID, new Uint8Array(32).fill(1));
    expect(await unwrapVaultKey(other.kek, VAULT_ID, wrapped)).toBeNull();
    expect(await unwrapVaultKey(kek, encodeBase64Url(new Uint8Array(16)), wrapped)).toBeNull();
    const bytes = decodeBase64Url(wrapped)!;
    bytes[20] = (bytes[20] ?? 0) ^ 1;
    expect(await unwrapVaultKey(kek, VAULT_ID, encodeBase64Url(bytes))).toBeNull();
    expect(await unwrapVaultKey(kek, VAULT_ID, 'short')).toBeNull();
  });
});

describe('sealed snapshots', () => {
  const max = 20 * 1024 * 1024;

  it('round-trips and reveals nothing readable', async () => {
    const snapshot = await snapshotWithSalmon();
    const key = await importVaultKey(newVaultKeyBytes());
    const sealed = await sealSnapshot(key, VAULT_ID, 3, snapshot, max);
    if (sealed.kind !== 'sealed') throw new Error(sealed.kind);
    expect(JSON.stringify(sealed.envelope)).not.toContain('Salmon');
    expect(Object.keys(sealed.envelope)).toEqual(['v', 'vaultId', 'version', 'alg', 'nonce', 'ct']);
    const opened = await openSnapshot(key, sealed.envelope, { vaultId: VAULT_ID, version: 3 });
    expect(opened).toEqual({ kind: 'opened', snapshot });
  });

  it('is bound to the vault and the version: a swapped or replayed envelope does not open', async () => {
    const snapshot = await snapshotWithSalmon();
    const key = await importVaultKey(newVaultKeyBytes());
    const sealed = await sealSnapshot(key, VAULT_ID, 3, snapshot, max);
    if (sealed.kind !== 'sealed') throw new Error(sealed.kind);
    const e = sealed.envelope;
    // The relay claims it is version 4 (a replay under a newer number) ...
    const replay = { ...e, version: 4 };
    expect(await openSnapshot(key, replay, { vaultId: VAULT_ID, version: 4 })).toEqual({
      kind: 'authenticationFailed',
    });
    // ... or hands over another vault's envelope ...
    const swapped = { ...e, vaultId: encodeBase64Url(new Uint8Array(16).fill(1)) };
    expect(await openSnapshot(key, swapped, { vaultId: swapped.vaultId, version: 3 })).toEqual({
      kind: 'authenticationFailed',
    });
    // ... or the answer disagrees with what the envelope says.
    expect(await openSnapshot(key, e, { vaultId: VAULT_ID, version: 2 })).toEqual({
      kind: 'authenticationFailed',
    });
    // Another key, or a changed ciphertext byte.
    const otherKey = await importVaultKey(newVaultKeyBytes());
    expect(await openSnapshot(otherKey, e, { vaultId: VAULT_ID, version: 3 })).toEqual({
      kind: 'authenticationFailed',
    });
    const ct = decodeBase64Url(e.ct)!;
    ct[10] = (ct[10] ?? 0) ^ 1;
    expect(
      await openSnapshot(key, { ...e, ct: encodeBase64Url(ct) }, { vaultId: VAULT_ID, version: 3 }),
    ).toEqual({ kind: 'authenticationFailed' });
  });

  it('refuses what is not a relay envelope, and a snapshot too large for the server', async () => {
    const snapshot = await snapshotWithSalmon();
    const key = await importVaultKey(newVaultKeyBytes());
    expect(await openSnapshot(key, { v: 1 }, { vaultId: VAULT_ID, version: 1 })).toEqual({
      kind: 'malformed',
    });
    expect((await sealSnapshot(key, VAULT_ID, 1, snapshot, 40)).kind).toBe('tooLarge');
  });
});
