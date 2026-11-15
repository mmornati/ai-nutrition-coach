// The credential lifecycle of a server copy (docs/adr/0007-encrypted-vault.md, S4): change its
// passphrase, add / rotate / remove the recovery key, recover with it, delete the copy, list and
// revoke devices, bring back the previous version.
//
// What proves what. The device token says "this device is connected"; it can list and revoke
// devices but cannot change or delete anything. Anything that changes who can open the copy needs a
// PROOF besides the token: the authKey derived from the current passphrase (Argon2id of the passphrase
// with the copy's current salt, then HKDF), or, to set a new passphrase after losing the old one,
// the authKey derived from the recovery key. The relay compares a keyed hash of it in constant time.
// A stolen token alone therefore can neither lock the owner out nor take the copy over.
//
// The vault key never changes here, so the sealed snapshots stay valid: only the wraps around it
// are redone (new salt, new KEK, new wrap), and the relay swaps salt, proof and wrap in one step.

import {
  decodeBase64Url,
  encodeBase64Url,
  normalizeHandle,
  SYNC_FIELD_BYTES,
  type AccountInfo,
  type ProofOf,
  type VaultStore,
} from '@anc/core';
import { validateNewPassphrase } from '../../storage/passphrase';
import {
  checkServerPassphrase,
  type ServerPassphraseIssue,
} from '../../storage/passphrase-strength';
import type { VaultKdf } from '../vault/kdf';
import type { RelayClient, RelayError } from './client';
import type { RelayConnection } from './connection';
import {
  derivePassphraseKeys,
  deriveRecoveryKeys,
  importVaultKey,
  openSnapshot,
  formatRecoveryKey,
  newRecoveryKeyBytes,
  parseRecoveryKey,
  platformRandom,
  unwrapWithRecovery,
  wrapVaultKey,
  wrapWithRecovery,
  type RandomSource,
} from './crypto';
import { mapAsk, openWithKey, type OpenedServerCopy } from './server-copy';

/** What a device tells the owner's device list about itself: "iPhone · Safari". No version, no id. */
export function describeDevice(ua: string): string {
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux|X11/.test(ua)
              ? 'Linux'
              : '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS/.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : '';
  return [os, browser].filter((p) => p !== '').join(' · ');
}

/** This browser's label (empty when it cannot tell). */
export function deviceLabel(): string {
  return typeof navigator === 'undefined' ? '' : describeDevice(navigator.userAgent);
}

export type AccountFailure =
  | 'invalidHandle'
  | 'invalidRecoveryKey'
  | { readonly passphrase: ServerPassphraseIssue }
  /** The passphrase (or recovery key) is not the one of this copy. */
  | 'noMatch'
  | 'rateLimited'
  | 'offline'
  | 'signInRequired'
  /** This device's token is no longer accepted: it was disconnected from the server copy. */
  | 'disconnected'
  | 'unavailable'
  | 'damaged'
  | 'notFound';

export type AccountResult<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | {
      readonly kind: 'failed';
      readonly failure: AccountFailure;
      readonly retryAfterSeconds?: number;
    };

const failed = (failure: AccountFailure, retryAfterSeconds?: number): AccountResult<never> => ({
  kind: 'failed',
  failure,
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
});
const ok = <T>(value: T): AccountResult<T> => ({ kind: 'ok', value });

function fromError(
  error: RelayError,
  retryAfterSeconds?: number,
): Extract<AccountResult<never>, { kind: 'failed' }> {
  switch (error) {
    case 'noMatch':
    case 'rateLimited':
    case 'offline':
    case 'signInRequired':
    case 'notFound':
      return failed(error, retryAfterSeconds) as Extract<AccountResult<never>, { kind: 'failed' }>;
    case 'unauthorized':
      return failed('disconnected') as Extract<AccountResult<never>, { kind: 'failed' }>;
    default:
      return failed('unavailable') as Extract<AccountResult<never>, { kind: 'failed' }>;
  }
}

interface Deps {
  readonly client: RelayClient;
  readonly kdf: VaultKdf;
  readonly connection: RelayConnection;
  readonly random?: RandomSource;
}

/** The authKey of the CURRENT passphrase: asks for the copy's salt, runs the KDF. */
async function passphraseProof(
  deps: Deps,
  passphrase: string,
): Promise<AccountResult<{ readonly proof: ProofOf }>> {
  const salt = await deps.client.salt(deps.connection.handle);
  if (salt.kind === 'error') return fromError(salt.error, salt.retryAfterSeconds);
  const bytes = decodeBase64Url(salt.value.salt);
  if (bytes === null) return failed('unavailable');
  try {
    const keys = await derivePassphraseKeys(deps.kdf, passphrase, bytes);
    return ok({ proof: { kind: 'passphrase', authKey: encodeBase64Url(keys.authKey) } });
  } catch {
    return failed('unavailable');
  }
}

function vaultKeyOf(connection: RelayConnection): Uint8Array | null {
  return decodeBase64Url(connection.vaultKey);
}

/** Checks a NEW passphrase for the copy: the floor, then the strength check. */
export function newPassphraseIssue(
  passphrase: string,
  handle: string,
): ServerPassphraseIssue | null {
  return validateNewPassphrase(passphrase) ?? checkServerPassphrase(passphrase, { handle });
}

/** Fresh salt, keys and wrap of `vaultKey` for `passphrase`. */
async function wrapForPassphrase(
  deps: Pick<Deps, 'kdf' | 'random'>,
  vaultId: string,
  vaultKey: Uint8Array,
  passphrase: string,
): Promise<{ salt: string; authKey: string; wrappedKey: string } | null> {
  const random = deps.random ?? platformRandom;
  const salt = random(SYNC_FIELD_BYTES.salt);
  try {
    const keys = await derivePassphraseKeys(deps.kdf, passphrase, salt);
    const wrappedKey = await wrapVaultKey(keys.kek, vaultId, vaultKey, random);
    const authKey = encodeBase64Url(keys.authKey);
    keys.authKey.fill(0);
    return { salt: encodeBase64Url(salt), authKey, wrappedKey };
  } catch {
    return null;
  }
}

/** Changes the passphrase of the server copy. Every other device is signed out; this one stays. */
export async function changeServerPassphrase(
  deps: Deps & { readonly current: string; readonly next: string },
): Promise<AccountResult<{ readonly signedOut: number }>> {
  const { client, connection } = deps;
  const issue = newPassphraseIssue(deps.next, connection.handle);
  if (issue !== null) return failed({ passphrase: issue });
  const proved = await passphraseProof(deps, deps.current);
  if (proved.kind === 'failed') return proved;
  const vaultKey = vaultKeyOf(connection);
  if (vaultKey === null) return failed('damaged');
  try {
    const wrapped = await wrapForPassphrase(deps, connection.vaultId, vaultKey, deps.next);
    if (wrapped === null) return failed('unavailable');
    const done = await client.changePassphrase(connection.token, {
      proof: proved.value.proof,
      ...wrapped,
    });
    return done.kind === 'error'
      ? fromError(done.error, done.retryAfterSeconds)
      : ok({ signedOut: done.value.revoked });
  } finally {
    vaultKey.fill(0);
  }
}

/**
 * Adds or rotates the recovery key (the old one stops working at once) and returns the new one,
 * grouped for reading. It is shown once and kept nowhere.
 */
export async function setServerRecoveryKey(
  deps: Deps & { readonly passphrase: string },
): Promise<AccountResult<{ readonly recoveryKey: string }>> {
  const { client, connection } = deps;
  const proved = await passphraseProof(deps, deps.passphrase);
  if (proved.kind === 'failed') return proved;
  const vaultKey = vaultKeyOf(connection);
  if (vaultKey === null) return failed('damaged');
  const bytes = newRecoveryKeyBytes(deps.random);
  try {
    const keys = await deriveRecoveryKeys(connection.handle, bytes);
    const wrappedKey = await wrapWithRecovery(keys.kek, connection.vaultId, vaultKey, deps.random);
    const done = await client.setRecovery(connection.token, proved.value.proof, {
      authKey: encodeBase64Url(keys.authKey),
      wrappedKey,
    });
    keys.authKey.fill(0);
    return done.kind === 'error'
      ? fromError(done.error, done.retryAfterSeconds)
      : ok({ recoveryKey: formatRecoveryKey(bytes) });
  } catch {
    return failed('unavailable');
  } finally {
    vaultKey.fill(0);
    bytes.fill(0);
  }
}

export async function removeServerRecoveryKey(
  deps: Deps & { readonly passphrase: string },
): Promise<AccountResult<null>> {
  const proved = await passphraseProof(deps, deps.passphrase);
  if (proved.kind === 'failed') return proved;
  const done = await deps.client.setRecovery(deps.connection.token, proved.value.proof, null);
  return done.kind === 'error' ? fromError(done.error, done.retryAfterSeconds) : ok(null);
}

/** Removes the copy from the server. The caller then makes this device forget the connection. */
export async function deleteServerCopy(
  deps: Deps & { readonly passphrase: string },
): Promise<AccountResult<null>> {
  const proved = await passphraseProof(deps, deps.passphrase);
  if (proved.kind === 'failed') return proved;
  const done = await deps.client.deleteVault(deps.connection.token, proved.value.proof);
  return done.kind === 'error' ? fromError(done.error, done.retryAfterSeconds) : ok(null);
}

export const loadAccount = async (deps: Deps): Promise<AccountResult<AccountInfo>> => {
  const got = await deps.client.account(deps.connection.token);
  return got.kind === 'error' ? fromError(got.error, got.retryAfterSeconds) : ok(got.value);
};

export async function revokeServerDevices(
  deps: Deps,
  target: { readonly id: number } | { readonly others: true },
): Promise<AccountResult<{ readonly revoked: number }>> {
  const done = await deps.client.revokeDevices(deps.connection.token, target);
  return done.kind === 'error' ? fromError(done.error, done.retryAfterSeconds) : ok(done.value);
}

/** A copy found with the recovery key whose new passphrase has NOT been set on the server yet. */
export interface RecoveredServerCopy {
  readonly copy: OpenedServerCopy;
  /**
   * Sets the new passphrase on the server (and so signs the other devices out). Call it only once
   * the person has confirmed. A failure leaves everything as it was and may be retried; after a
   * success it does nothing more.
   */
  confirm(): Promise<AccountResult<null>>;
  /**
   * The person cancelled, or the copy was refused: signs out the session the recovery login made
   * (best effort) and leaves the server passphrase, and every other device, untouched. Does nothing
   * once `confirm` has succeeded. Always wipes what it holds.
   */
  abandon(): Promise<void>;
}

/**
 * Finding a copy with the recovery key instead of the passphrase: log in with the recovery proof,
 * open the vault key with the recovery KEK and open the copy. It changes NOTHING on the server yet:
 * the caller shows what was found, and only when the person confirms calls `confirm()`, which
 * re-wraps the vault key under the new passphrase (the relay revokes every other token). If the
 * copy is refused or the person cancels, `abandon()` signs this recovery session out instead, so
 * the server passphrase stays as it was and no orphan token is left.
 * The copy is opened exactly like `openServerCopy`'s, so the caller joins or restores as usual.
 */
export async function recoverServerCopy(deps: {
  readonly client: RelayClient;
  readonly kdf: VaultKdf;
  readonly handle: string;
  readonly recoveryKey: string;
  readonly newPassphrase: string;
  readonly label?: string | undefined;
  readonly random?: RandomSource;
}): Promise<AccountResult<RecoveredServerCopy>> {
  const handle = normalizeHandle(deps.handle);
  if (handle === null) return failed('invalidHandle');
  const bytes = parseRecoveryKey(deps.recoveryKey);
  if (bytes === null) return failed('invalidRecoveryKey');
  const issue = newPassphraseIssue(deps.newPassphrase, handle);
  if (issue !== null) return failed({ passphrase: issue });
  const { client } = deps;
  try {
    const keys = await deriveRecoveryKeys(handle, bytes);
    const proofKey = encodeBase64Url(keys.authKey);
    keys.authKey.fill(0);
    const login = await client.recover(handle, proofKey, deps.label);
    if (login.kind === 'error') return fromError(login.error, login.retryAfterSeconds);
    const session = login.value;
    const signOut = async (): Promise<void> => {
      try {
        const got = await client.account(session.token);
        if (got.kind === 'error') return;
        const mine = got.value.devices.find((d) => d.current);
        if (mine !== undefined) await client.revokeDevices(session.token, { id: mine.id });
      } catch {
        // Best effort: an orphan token expires by itself.
      }
    };
    const raw = await unwrapWithRecovery(keys.kek, session.vaultId, session.wrappedKey);
    if (raw === null) {
      await signOut();
      return failed('damaged');
    }
    const opened = await openWithKey(client, handle, session, raw);
    if (opened.kind === 'failed') {
      await signOut();
      return opened.failure === 'rateLimited' || opened.failure === 'offline'
        ? failed(opened.failure, opened.retryAfterSeconds)
        : failed(opened.failure === 'damaged' ? 'damaged' : 'unavailable');
    }
    const copy = opened.copy;
    let state: 'pending' | 'confirmed' | 'closed' = 'pending';
    return ok({
      copy,
      async confirm() {
        if (state === 'confirmed') return ok(null);
        if (state === 'closed') return failed('unavailable');
        try {
          const wrapped = await wrapForPassphrase(
            deps,
            session.vaultId,
            copy.vaultKey,
            deps.newPassphrase,
          );
          if (wrapped === null) return failed('unavailable');
          const changed = await client.changePassphrase(session.token, {
            proof: { kind: 'recovery', authKey: proofKey },
            ...wrapped,
          });
          if (changed.kind === 'error') return fromError(changed.error, changed.retryAfterSeconds);
          state = 'confirmed';
          return ok(null);
        } catch {
          return failed('unavailable');
        }
      },
      async abandon() {
        if (state === 'confirmed') return;
        const wasPending = state === 'pending';
        state = 'closed';
        copy.vaultKey.fill(0);
        if (wasPending) await signOut();
      },
    });
  } catch {
    return failed('unavailable');
  } finally {
    bytes.fill(0);
  }
}

/**
 * Brings back what the version kept before the latest one held: fetched, opened with this device's
 * vault key and MERGED into this device (anything it had that this device lacks is added; nothing
 * is removed, and a plate deleted since stays deleted). The caller then lets the usual backup send
 * the result.
 */
export async function restorePreviousVersion(
  deps: Deps & { readonly vault: VaultStore },
): Promise<AccountResult<null>> {
  const got = await deps.client.getPrevious(deps.connection.token);
  if (got.kind === 'error') return fromError(got.error, got.retryAfterSeconds);
  const raw = vaultKeyOf(deps.connection);
  if (raw === null) return failed('damaged');
  try {
    const opened = await openSnapshot(await importVaultKey(raw), got.value.envelope, {
      vaultId: got.value.vaultId,
      version: got.value.version,
    });
    if (opened.kind !== 'opened') return failed('damaged');
    const applied = await deps.vault.applySnapshot(opened.snapshot);
    return applied.kind === 'vault' ? ok(null) : failed('unavailable');
  } catch {
    return failed('unavailable');
  } finally {
    raw.fill(0);
  }
}

export { mapAsk };
