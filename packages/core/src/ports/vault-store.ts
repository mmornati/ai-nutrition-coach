import type { VaultResult } from '../results/vault';
import type { VaultSnapshot } from '../vault/snapshot';

/**
 * Everything the person has, as one snapshot, and the way back in. Nothing user-visible uses it
 * yet (docs/encrypted-sync-plan.md, phase S0); the encrypted backup (S1) and sync (S3) are built
 * on it. The snapshot never holds the BYOK key or any other device-only `kv` entry.
 */
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
}
