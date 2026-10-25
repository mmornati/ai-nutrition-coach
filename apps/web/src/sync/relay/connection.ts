// What a device remembers about its relay vault, in the encrypted `kv` table under device-only keys
// (they are not on the sync allow-list, so none of them can ever enter a snapshot or an export):
// the handle, the device token, the raw vault key, the vault id and the highest version seen. They
// are read only as a complete, valid set: half a connection is no connection.

import { fixedBase64Url, HANDLE_PATTERN, SYNC_FIELD_BYTES, ENVELOPE_LIMITS } from '@anc/core';
import { KV_KEYS, type KeyValueStore } from '../../storage/key-value-store';

export interface RelayConnection {
  readonly handle: string;
  /** The device token (a secret), base64url. */
  readonly token: string;
  /** The raw 32-byte vault key (a secret), base64url. */
  readonly vaultKey: string;
  readonly vaultId: string;
  /** The highest version of the vault this device has seen. */
  readonly lastSeenVersion: number;
}

const CONNECTION_KEYS = [
  KV_KEYS.syncHandle,
  KV_KEYS.syncToken,
  KV_KEYS.syncVaultKey,
  KV_KEYS.syncVaultId,
  KV_KEYS.syncLastSeenVersion,
  KV_KEYS.syncDirty,
  KV_KEYS.syncBaseline,
] as const;

/** The connection, or `null` when this device has none (or what is stored is not a whole one). */
export async function readConnection(kv: KeyValueStore): Promise<RelayConnection | null> {
  const [handle, token, vaultKey, vaultId, seen] = await Promise.all([
    kv.read(KV_KEYS.syncHandle),
    kv.read(KV_KEYS.syncToken),
    kv.read(KV_KEYS.syncVaultKey),
    kv.read(KV_KEYS.syncVaultId),
    kv.read(KV_KEYS.syncLastSeenVersion),
  ]);
  if (handle === null || token === null || vaultKey === null || vaultId === null || seen === null) {
    return null;
  }
  const version = /^[1-9][0-9]{0,15}$/.test(seen) ? Number(seen) : NaN;
  if (
    !HANDLE_PATTERN.test(handle) ||
    fixedBase64Url(token, SYNC_FIELD_BYTES.token) === null ||
    fixedBase64Url(vaultKey, SYNC_FIELD_BYTES.token) === null ||
    fixedBase64Url(vaultId, ENVELOPE_LIMITS.vaultIdBytes) === null ||
    !Number.isSafeInteger(version)
  ) {
    return null;
  }
  return { handle, token, vaultKey, vaultId, lastSeenVersion: version };
}

/** Stores the whole connection (and an unset dirty flag: what was just synced is not "changed"). */
export async function writeConnection(
  kv: KeyValueStore,
  connection: RelayConnection,
  dirty = false,
): Promise<void> {
  // A baseline left by an earlier vault must never describe this one.
  await kv.delete(KV_KEYS.syncBaseline);
  await kv.write(KV_KEYS.syncVaultKey, connection.vaultKey);
  await kv.write(KV_KEYS.syncToken, connection.token);
  await kv.write(KV_KEYS.syncVaultId, connection.vaultId);
  await kv.write(KV_KEYS.syncLastSeenVersion, String(connection.lastSeenVersion));
  if (dirty) await kv.write(KV_KEYS.syncDirty, '1');
  else await kv.delete(KV_KEYS.syncDirty);
  // Written last: the handle is what makes the set readable.
  await kv.write(KV_KEYS.syncHandle, connection.handle);
}

/** Forgets the connection on this device. The relay's copy is untouched. */
export async function clearConnection(kv: KeyValueStore): Promise<void> {
  // The baseline first, then the handle, so a failure half way leaves neither a stale baseline nor
  // a readable (half) connection.
  await kv.delete(KV_KEYS.syncBaseline);
  for (const key of CONNECTION_KEYS) await kv.delete(key);
}

export async function writeLastSeen(kv: KeyValueStore, version: number): Promise<void> {
  await kv.write(KV_KEYS.syncLastSeenVersion, String(version));
}

export async function readDirty(kv: KeyValueStore): Promise<boolean> {
  return (await kv.read(KV_KEYS.syncDirty)) === '1';
}
export async function writeDirty(kv: KeyValueStore, dirty: boolean): Promise<void> {
  if (dirty) await kv.write(KV_KEYS.syncDirty, '1');
  else await kv.delete(KV_KEYS.syncDirty);
}

export async function readBaseline(kv: KeyValueStore): Promise<string | null> {
  return kv.read(KV_KEYS.syncBaseline);
}
export async function writeBaseline(kv: KeyValueStore, value: string): Promise<void> {
  await kv.write(KV_KEYS.syncBaseline, value);
}
