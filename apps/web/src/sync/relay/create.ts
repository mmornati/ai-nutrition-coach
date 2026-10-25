// Case C: the first device creates the vault on the relay ("Back up to this server"). Handle and
// passphrase, an optional invite code, then one signup request that carries the salt, the proof of
// the passphrase, the wrapped vault key and the first sealed snapshot (version 1). Nothing but
// those goes out; a failure leaves the device exactly as it was.

import {
  canonicalizeSnapshot,
  encodeBase64Url,
  ENVELOPE_LIMITS,
  normalizeHandle,
  SYNC_FIELD_BYTES,
  type SignupRequest,
  type VaultSnapshot,
  type VaultStore,
} from '@anc/core';
import { validateNewPassphrase, type PassphraseIssue } from '../../storage/passphrase';
import type { KeyValueStore } from '../../storage/key-value-store';
import type { VaultKdf } from '../vault/kdf';
import type { RelayClient, RelayError } from './client';
import { writeConnection, type RelayConnection } from './connection';
import { writeHeld } from './ledger';
import {
  derivePassphraseKeys,
  importVaultKey,
  newVaultKeyBytes,
  platformRandom,
  sealSnapshot,
  wrapVaultKey,
  type RandomSource,
} from './crypto';

export type CreateVaultFailure =
  | 'invalidHandle'
  | { readonly passphrase: PassphraseIssue }
  | 'handleTaken'
  | 'signupClosed'
  | 'inviteInvalid'
  | 'serverFull'
  | 'rateLimited'
  | 'offline'
  | 'unavailable'
  | 'tooLarge'
  /** The local store could not be read (locked). */
  | 'storeProblem';

export type CreateVaultResult =
  | { readonly kind: 'created'; readonly connection: RelayConnection; readonly dirty: boolean }
  | {
      readonly kind: 'failed';
      readonly failure: CreateVaultFailure;
      readonly retryAfterSeconds?: number;
    };

const failed = (failure: CreateVaultFailure, retryAfterSeconds?: number): CreateVaultResult => ({
  kind: 'failed',
  failure,
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
});

const asFailure = (error: RelayError): CreateVaultFailure => {
  switch (error) {
    case 'handleTaken':
    case 'signupClosed':
    case 'inviteInvalid':
    case 'serverFull':
    case 'rateLimited':
    case 'offline':
    case 'tooLarge':
      return error;
    default:
      return 'unavailable';
  }
};

export async function createServerVault(deps: {
  readonly client: RelayClient;
  readonly kdf: VaultKdf;
  readonly vault: VaultStore;
  readonly kv: KeyValueStore;
  readonly handle: string;
  readonly passphrase: string;
  readonly invite?: string | undefined;
  readonly maxVaultBytes: number;
  readonly random?: RandomSource;
}): Promise<CreateVaultResult> {
  const random = deps.random ?? platformRandom;
  const handle = normalizeHandle(deps.handle);
  if (handle === null) return failed('invalidHandle');
  const issue = validateNewPassphrase(deps.passphrase);
  if (issue !== null) return failed({ passphrase: issue });

  const read = await deps.vault.readSnapshot();
  if (read.kind === 'vaultFailed') return failed('storeProblem');
  const uploaded: VaultSnapshot = read.value;

  const salt = random(SYNC_FIELD_BYTES.salt);
  let keys;
  try {
    keys = await derivePassphraseKeys(deps.kdf, deps.passphrase, salt);
  } catch {
    return failed('unavailable');
  }
  const vaultKeyBytes = newVaultKeyBytes(random);
  const vaultId = encodeBase64Url(random(ENVELOPE_LIMITS.vaultIdBytes));
  try {
    const wrappedKey = await wrapVaultKey(keys.kek, vaultId, vaultKeyBytes, random);
    const sealed = await sealSnapshot(
      await importVaultKey(vaultKeyBytes),
      vaultId,
      1,
      uploaded,
      deps.maxVaultBytes,
      random,
    );
    if (sealed.kind === 'tooLarge') return failed('tooLarge');
    if (sealed.kind === 'unavailable') return failed('unavailable');
    const request: SignupRequest = {
      handle,
      salt: encodeBase64Url(salt),
      authKey: encodeBase64Url(keys.authKey),
      wrappedKey,
      envelope: sealed.envelope,
      ...(deps.invite === undefined || deps.invite === '' ? {} : { invite: deps.invite }),
    };
    const response = await deps.client.signup(request);
    if (response.kind === 'error')
      return failed(asFailure(response.error), response.retryAfterSeconds);
    const connection: RelayConnection = {
      handle,
      token: response.value.token,
      vaultKey: encodeBase64Url(vaultKeyBytes),
      vaultId,
      lastSeenVersion: response.value.version,
    };
    // Something may have been logged while the key was derived: it is not in what was uploaded.
    const after = await deps.vault.readSnapshot();
    const dirty =
      after.kind !== 'vault' ||
      JSON.stringify(canonicalizeSnapshot(after.value)) !==
        JSON.stringify(canonicalizeSnapshot(uploaded));
    try {
      await writeConnection(deps.kv, connection, dirty);
    } catch {
      return failed('storeProblem');
    }
    // The relay was just given `uploaded`: those plates are on the server.
    await writeHeld(deps.kv, uploaded);
    return { kind: 'created', connection, dirty };
  } catch {
    return failed('unavailable');
  } finally {
    keys.authKey.fill(0);
    vaultKeyBytes.fill(0);
  }
}
