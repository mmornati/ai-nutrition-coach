// Finding and opening this person's copy on the relay: handle and passphrase together, then login,
// download, unwrap the vault key, decrypt, validate. Nothing is written anywhere; the caller gets
// the opened copy (or one typed reason) and decides what to do with it (Case A restores it into a
// new store, Case B previews a merge). The reasons keep apart only what can honestly be told apart:
// "nothing matches this handle and passphrase" is ONE answer, because the relay never says which.

import { decodeBase64Url, encodeBase64Url, normalizeHandle, type VaultSnapshot } from '@anc/core';
import type { VaultKdf } from '../vault/kdf';
import type { RelayClient } from './client';
import {
  derivePassphraseKeys,
  importVaultKey,
  openSnapshot,
  unwrapVaultKey,
  type PassphraseKeys,
} from './crypto';

/** What stays with the caller after a successful open. The vault key bytes are a secret: wipe them. */
export interface OpenedServerCopy {
  readonly handle: string;
  readonly token: string;
  readonly vaultId: string;
  readonly version: number;
  /** Raw 32-byte vault key. */
  readonly vaultKey: Uint8Array;
  readonly snapshot: VaultSnapshot;
}

export type OpenServerCopyFailure =
  | 'invalidHandle'
  /** No vault matches this handle and passphrase. */
  | 'noMatch'
  | 'rateLimited'
  /** No answer from the server. */
  | 'offline'
  /** The server answered something unusable, or the key derivation could not run. */
  | 'unavailable'
  /** The copy was written by a newer version of the app. */
  | 'schemaTooNew'
  /** The login worked but the copy would not open or validate. */
  | 'damaged'
  | 'tooLarge';

export type OpenServerCopyResult =
  | { readonly kind: 'opened'; readonly copy: OpenedServerCopy }
  | {
      readonly kind: 'failed';
      readonly failure: OpenServerCopyFailure;
      readonly retryAfterSeconds?: number;
    };

const failed = (
  failure: OpenServerCopyFailure,
  retryAfterSeconds?: number,
): OpenServerCopyResult => ({
  kind: 'failed',
  failure,
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
});

export async function openServerCopy(deps: {
  readonly client: RelayClient;
  readonly kdf: VaultKdf;
  readonly handle: string;
  readonly passphrase: string;
}): Promise<OpenServerCopyResult> {
  const handle = normalizeHandle(deps.handle);
  if (handle === null) return failed('invalidHandle');
  const { client } = deps;

  const salt = await client.salt(handle);
  if (salt.kind === 'error') return failed(mapAsk(salt.error), salt.retryAfterSeconds);
  const saltBytes = decodeBase64Url(salt.value.salt);
  if (saltBytes === null) return failed('unavailable');

  let keys: PassphraseKeys;
  try {
    keys = await derivePassphraseKeys(deps.kdf, deps.passphrase, saltBytes);
  } catch {
    return failed('unavailable');
  }

  const login = await client.login(handle, encodeBase64Url(keys.authKey));
  keys.authKey.fill(0);
  if (login.kind === 'error') return failed(mapAsk(login.error), login.retryAfterSeconds);
  const session = login.value;

  // The relay accepted the proof of the passphrase, so a wrap that does not open is damage (or a
  // relay that is not telling the truth), not a wrong passphrase.
  const raw = await unwrapVaultKey(keys.kek, session.vaultId, session.wrappedKey);
  if (raw === null) return failed('damaged');

  const got = await client.getVault(session.token);
  if (got.kind === 'error') {
    raw.fill(0);
    return failed(mapAsk(got.error));
  }
  if (got.value.kind !== 'vault') {
    raw.fill(0);
    return failed('unavailable');
  }
  const { vault } = got.value;
  if (vault.vaultId !== session.vaultId || vault.version < session.version) {
    raw.fill(0);
    return failed('damaged');
  }
  let opened;
  try {
    opened = await openSnapshot(await importVaultKey(raw), vault.envelope, {
      vaultId: vault.vaultId,
      version: vault.version,
    });
  } catch {
    raw.fill(0);
    return failed('unavailable');
  }
  if (opened.kind !== 'opened') {
    raw.fill(0);
    if (opened.kind === 'schemaTooNew') return failed('schemaTooNew');
    if (opened.kind === 'tooLarge') return failed('tooLarge');
    return failed('damaged');
  }
  return {
    kind: 'opened',
    copy: {
      handle,
      token: session.token,
      vaultId: vault.vaultId,
      version: vault.version,
      vaultKey: raw,
      snapshot: opened.snapshot,
    },
  };
}

function mapAsk(error: string): OpenServerCopyFailure {
  switch (error) {
    case 'noMatch':
      return 'noMatch';
    case 'rateLimited':
      return 'rateLimited';
    case 'offline':
      return 'offline';
    case 'tooLarge':
      return 'tooLarge';
    case 'newerFormat':
      return 'schemaTooNew';
    default:
      return 'unavailable';
  }
}
