// The plaintext of a vault envelope, shared by the backup file and the relay: a snapshot as
// canonical JSON, UTF-8, gzip. Reading goes the other way with the same refusals: a decompressed
// size cap (a gzip bomb is cut off), strict UTF-8 and JSON, "this was written by a newer app" named
// before the strict parser could call it malformed, then `parseVaultSnapshot`.

import {
  canonicalizeSnapshot,
  ENVELOPE_LIMITS,
  parseVaultSnapshot,
  SNAPSHOT_VERSION,
  type VaultSnapshot,
} from '@anc/core';
import { SCHEMA_VERSION } from '../../storage/constants';
import { gunzip, gzip } from './gzip';

export type EncodeSnapshotResult =
  | { readonly kind: 'encoded'; readonly bytes: Uint8Array }
  | { readonly kind: 'tooLarge' }
  | { readonly kind: 'unavailable' };

/** `maxCiphertextBytes`: the compressed plaintext plus the tag must fit under it. */
export async function encodeSnapshot(
  snapshot: VaultSnapshot,
  maxCiphertextBytes: number = ENVELOPE_LIMITS.maxCiphertextBytes,
): Promise<EncodeSnapshotResult> {
  const json = new TextEncoder().encode(JSON.stringify(canonicalizeSnapshot(snapshot)));
  if (json.length > ENVELOPE_LIMITS.maxPlaintextBytes) return { kind: 'tooLarge' };
  let compressed: Uint8Array;
  try {
    compressed = await gzip(json);
  } catch {
    return { kind: 'unavailable' };
  }
  return compressed.length + ENVELOPE_LIMITS.tagBytes > maxCiphertextBytes
    ? { kind: 'tooLarge' }
    : { kind: 'encoded', bytes: compressed };
}

export type DecodeSnapshotResult =
  | { readonly kind: 'decoded'; readonly snapshot: VaultSnapshot }
  | { readonly kind: 'tooLarge' }
  | { readonly kind: 'schemaTooNew' }
  | { readonly kind: 'invalidContent' };

/** The authenticated plaintext of an envelope to a validated snapshot. */
export async function decodeSnapshot(plaintext: Uint8Array): Promise<DecodeSnapshotResult> {
  const inflated = await gunzip(plaintext, ENVELOPE_LIMITS.maxPlaintextBytes);
  if (inflated.kind === 'tooLarge') return { kind: 'tooLarge' };
  if (inflated.kind === 'corrupt') return { kind: 'invalidContent' };
  let content: unknown;
  try {
    content = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inflated.bytes));
  } catch {
    return { kind: 'invalidContent' };
  }
  if (newerThanThisApp(content)) return { kind: 'schemaTooNew' };
  const snapshot = parseVaultSnapshot(content);
  return snapshot.kind === 'vaultSnapshotParsed'
    ? { kind: 'decoded', snapshot: snapshot.snapshot }
    : { kind: 'invalidContent' };
}

function newerThanThisApp(content: unknown): boolean {
  if (typeof content !== 'object' || content === null) return false;
  const { snapshotVersion, schemaVersion } = content as Record<string, unknown>;
  return (
    (typeof snapshotVersion === 'number' && snapshotVersion > SNAPSHOT_VERSION) ||
    (typeof schemaVersion === 'number' && schemaVersion > SCHEMA_VERSION)
  );
}
