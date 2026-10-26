import type { VaultResult } from '../results/vault';
import type { VaultSnapshot } from '../vault/snapshot';

/**
 * Everything the person has, as one snapshot, and the way back in. Nothing user-visible uses it
 * yet (docs/encrypted-sync-plan.md, phase S0); the encrypted backup (S1) and sync (S3) are built
 * on it. The snapshot never holds the BYOK key or any other device-only `kv` entry.
 */
/** A plate's local id (what the screens hold) and its uid (what a snapshot holds). */
export interface PlateIdentity {
  readonly plateLogId: number;
  readonly uid: string;
}

export interface VaultStore {
  /** A consistent read of the whole store, in canonical order. */
  readSnapshot(): Promise<VaultResult<VaultSnapshot>>;
  /**
   * Writes the snapshot into the store in ONE transaction (all or nothing), matching records by
   * `uid`: what is missing is added, a tombstone removes its record, a saved meal / recipe / kv
   * entry replaces the local one only when its stamp is newer. Nothing local is deleted merely for
   * being absent from the snapshot, so a restore into an empty store and "apply the merged
   * snapshot" are the same call. Idempotent. The snapshot must have passed `parseVaultSnapshot`.
   */
  applySnapshot(snapshot: VaultSnapshot): Promise<VaultResult<null>>;
  /**
   * The local id and uid of every plate, no content. The honest per-plate sync status (a plate is
   * `synced` once a snapshot the relay acknowledged held its uid) is looked up through it.
   */
  readPlateIdentities(): Promise<VaultResult<readonly PlateIdentity[]>>;
}
