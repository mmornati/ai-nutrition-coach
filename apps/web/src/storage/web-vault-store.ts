// The web `VaultStore`: the whole store as a vault snapshot, and the way back in (schema v4; nothing
// user-visible uses it yet). A thin view over the controller's open database, like the other
// ports: while the store is locked every call answers a typed `locked` failure and nothing throws
// across the port. A snapshot is validated again on the way out (what leaves is always parseable)
// and on the way in (what is applied has passed the strict parser, whoever produced it).

import {
  parseVaultSnapshot,
  type PlateIdentity,
  vaultFailed,
  vaultOk,
  type VaultResult,
  type VaultSnapshot,
  type VaultStore,
} from '@anc/core';
import type { ChangeBus } from './change-bus';
import { SCHEMA_VERSION } from './constants';
import { isProgrammingError, SessionClosedError } from './errors';
import type { StoreSource } from './store-source';

export class WebVaultStore implements VaultStore {
  constructor(
    private readonly source: StoreSource,
    private readonly bus: ChangeBus,
  ) {}

  async readSnapshot(): Promise<VaultResult<VaultSnapshot>> {
    const db = this.source.database();
    if (!db) return vaultFailed('locked');
    try {
      const parsed = parseVaultSnapshot(await db.readVault());
      return parsed.kind === 'vaultSnapshotParsed'
        ? vaultOk(parsed.snapshot)
        : vaultFailed('storeOperation');
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      return vaultFailed(error instanceof SessionClosedError ? 'locked' : 'storeOperation');
    }
  }

  async readPlateIdentities(): Promise<VaultResult<readonly PlateIdentity[]>> {
    const db = this.source.database();
    if (!db) return vaultFailed('locked');
    try {
      const rows = await db.readPlateUids();
      return vaultOk(rows.map((r) => ({ plateLogId: r.id, uid: r.uid })));
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      return vaultFailed(error instanceof SessionClosedError ? 'locked' : 'storeOperation');
    }
  }

  async applySnapshot(snapshot: VaultSnapshot): Promise<VaultResult<null>> {
    const db = this.source.database();
    if (!db) return vaultFailed('locked');
    // Data from a newer schema is refused, never half understood.
    const claimed = (snapshot as { schemaVersion?: unknown }).schemaVersion;
    if (typeof claimed === 'number' && claimed > SCHEMA_VERSION) {
      return vaultFailed('schemaTooNew');
    }
    const parsed = parseVaultSnapshot(snapshot);
    if (parsed.kind !== 'vaultSnapshotParsed') return vaultFailed('invalid');
    try {
      const outcome = await db.applyVault(parsed.snapshot);
      if (outcome === 'clockAhead') return vaultFailed('clockAhead');
      if (outcome === 'conflict') return vaultFailed('invalid');
      this.bus.emit('plates', 'notes', 'dismissals', 'saved', 'kv');
      return vaultOk(null);
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      return vaultFailed(error instanceof SessionClosedError ? 'locked' : 'storeOperation');
    }
  }
}
