// The relay's storage: one SQLite file. A vault row holds what the relay needs to authenticate and
// serve a person: the handle, the salt, a keyed hash of the passphrase proof, the wrapped vault key
// and the sealed envelope (the current one and the one before). The relay never decrypts anything,
// and the only way in for vault content is `putEnvelope`, which takes an envelope that already
// passed the strict parser.
//
// The envelope columns hold up to ~54 MB between them (two sealed vaults), so the look-ups every
// salt / login / token check runs (`vaultByHandle`, `vaultByRowId`) select only the small columns:
// reading a whole vault for an unknown-or-known handle would be a memory amplifier and a timing
// difference between the two. The bodies are read only where a vault is actually returned
// (`vaultBody`).

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_VERSION = 2;

export interface VaultRow {
  readonly rowId: number;
  readonly handle: string;
  readonly vaultId: string;
  readonly salt: string;
  readonly authDigest: Buffer;
  readonly wrappedKey: string;
  readonly version: number;
  readonly size: number;
  readonly previousVersion: number | null;
  /** The second way in: a keyed hash of the recovery proof and the vault key wrapped under it. */
  readonly recAuthDigest: Buffer | null;
  readonly recWrappedKey: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** One device token of a vault, as the owner (and the admin) sees it. The token itself is never kept. */
export interface DeviceRow {
  readonly id: number;
  readonly label: string;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly tokenDigest: Buffer;
}

export interface InviteRow {
  readonly id: number;
  readonly label: string;
  readonly createdAt: number;
  readonly usedAt: number | null;
  readonly usedBy: string | null;
  readonly revokedAt: number | null;
}

/** What `admin list` shows about a vault: sizes and times, never anything from inside it. */
export interface VaultSummary {
  readonly handle: string;
  readonly size: number;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastSeenAt: number | null;
  readonly devices: number;
  readonly hasRecovery: boolean;
}

export interface NewCredentials {
  readonly salt: string;
  readonly authDigest: Buffer;
  readonly wrappedKey: string;
}

/** The sealed envelopes of a vault: large, read only to answer a vault read. */
export interface VaultBody {
  /** The envelope JSON, exactly as stored. */
  readonly envelope: string;
  readonly previousEnvelope: string | null;
}

export interface NewVault {
  readonly handle: string;
  readonly vaultId: string;
  readonly salt: string;
  readonly authDigest: Buffer;
  readonly wrappedKey: string;
  readonly envelope: string;
  readonly size: number;
  readonly recAuthDigest?: Buffer;
  readonly recWrappedKey?: string;
  /** The device label of the first device. */
  readonly label?: string;
  /** A stored (single-use) invite to consume together with the vault, by its keyed hash. */
  readonly inviteDigest?: Buffer;
}

export type PutResult =
  | { readonly kind: 'stored'; readonly version: number }
  /** The vault is at another version than the caller expected (or is gone). */
  | { readonly kind: 'conflict'; readonly version: number | null };

export interface RelayStore {
  vaultCount(): number;
  createVault(vault: NewVault, now: number): 'created' | 'handleTaken' | 'inviteInvalid';
  vaultByHandle(handle: string): VaultRow | null;
  vaultByRowId(rowId: number): VaultRow | null;
  /** The stored envelopes of one vault (the only read that touches them). */
  vaultBody(rowId: number): VaultBody | null;
  /**
   * Records a device token for a vault, dropping the ones used least recently past `maxDevices`
   * (so a phone that syncs every day is not signed out by a pile of look-ups made since).
   */
  addDevice(
    rowId: number,
    tokenDigest: Buffer,
    now: number,
    maxDevices: number,
    label?: string,
  ): void;
  /**
   * The vault row id a device token belongs to; refreshes "last seen" at most once a minute. A token
   * idle for `maxIdleMs` or more is deleted on the spot and answers null (0: never expires).
   */
  vaultForDevice(tokenDigest: Buffer, now: number, maxIdleMs?: number): number | null;
  listDevices(rowId: number): readonly DeviceRow[];
  /** Removes one device of this vault; 0 when there is no such device (or it is another vault's). */
  revokeDevice(rowId: number, deviceId: number): number;
  revokeOtherDevices(rowId: number, keep: Buffer): number;
  /** Swaps salt, proof and wrapped key in one step and revokes every device but `keep`. Returns the revoked count. */
  changeCredentials(rowId: number, keep: Buffer, next: NewCredentials, now: number): number;
  /** Sets, replaces or (null) removes the recovery material. */
  setRecovery(rowId: number, recovery: { authDigest: Buffer; wrappedKey: string } | null): void;
  /** Removes the vault row, both envelopes and (by cascade) every device. */
  deleteVault(rowId: number): void;
  // Invites: single use, stored as a keyed hash.
  createInvite(digest: Buffer, label: string, now: number): number;
  usableInvite(digest: Buffer): boolean;
  usableInviteCount(): number;
  listInvites(): readonly InviteRow[];
  revokeInvite(id: number, now: number): boolean;
  // Administration (the CLI; never reachable over HTTP).
  listVaults(): readonly VaultSummary[];
  /** Vaults with no write and no device use for `idleMs`, oldest first. */
  idleVaults(now: number, idleMs: number): readonly VaultSummary[];
  /** Compare-and-swap: replaces the envelope only when the vault is at `expectedVersion`. */
  putEnvelope(
    rowId: number,
    expectedVersion: number,
    envelope: string,
    size: number,
    now: number,
    keepPreviousMs?: number,
    /**
     * The digest of the device token making the write. Checked INSIDE the write: a token revoked
     * while its upload was in flight stores nothing and gets `{ kind: 'conflict', version: null }`.
     */
    byDevice?: Buffer,
  ): PutResult;
  close(): void;
}

const SEEN_REFRESH_MS = 60_000;

type Row = Record<string, unknown>;

function asVault(row: Row): VaultRow {
  return {
    rowId: Number(row['id']),
    handle: String(row['handle']),
    vaultId: String(row['vault_id']),
    salt: String(row['salt']),
    authDigest: Buffer.from(row['auth_digest'] as Uint8Array),
    wrappedKey: String(row['wrapped_key']),
    version: Number(row['version']),
    size: Number(row['size']),
    previousVersion: row['prev_version'] === null ? null : Number(row['prev_version']),
    recAuthDigest:
      row['rec_auth_digest'] === null ? null : Buffer.from(row['rec_auth_digest'] as Uint8Array),
    recWrappedKey: row['rec_wrapped_key'] === null ? null : String(row['rec_wrapped_key']),
    createdAt: Number(row['created_at']),
    updatedAt: Number(row['updated_at']),
  };
}

export function openStore(dataDir: string): RelayStore {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  return createStore(new DatabaseSync(join(dataDir, 'relay.sqlite')));
}

/** In memory, for tests. */
export function openMemoryStore(): RelayStore {
  return createStore(new DatabaseSync(':memory:'));
}

function inTransactionOn<T>(db: DatabaseSync, run: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function createStore(db: DatabaseSync): RelayStore {
  // busy_timeout: the admin CLI opens the same file while the relay runs.
  db.exec(
    'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;',
  );
  const found = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (found.user_version > SCHEMA_VERSION) {
    throw new Error('The relay database was made by a newer version of the relay.');
  }
  if (found.user_version === 0) {
    db.exec(`
      CREATE TABLE vault (
        id INTEGER PRIMARY KEY,
        handle TEXT NOT NULL UNIQUE,
        vault_id TEXT NOT NULL,
        salt TEXT NOT NULL,
        auth_digest BLOB NOT NULL,
        wrapped_key TEXT NOT NULL,
        version INTEGER NOT NULL,
        envelope TEXT NOT NULL,
        size INTEGER NOT NULL,
        prev_version INTEGER,
        prev_envelope TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE device (
        token_digest BLOB PRIMARY KEY,
        vault_row INTEGER NOT NULL REFERENCES vault(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE INDEX device_by_vault ON device(vault_row, created_at);
      PRAGMA user_version = 1;
    `);
  }
  // 1 -> 2 (S4): device labels, the recovery key, "when was the previous version set aside", and
  // stored single-use invites. Every new column is nullable or defaulted: a version-1 vault keeps
  // working exactly as it was and simply has no recovery key until its owner adds one.
  if (found.user_version < 2) {
    inTransactionOn(db, () => {
      db.exec(`
        ALTER TABLE vault ADD COLUMN rec_auth_digest BLOB;
        ALTER TABLE vault ADD COLUMN rec_wrapped_key TEXT;
        ALTER TABLE vault ADD COLUMN prev_at INTEGER;
        UPDATE vault SET prev_at = updated_at WHERE prev_envelope IS NOT NULL;
        ALTER TABLE device ADD COLUMN label TEXT NOT NULL DEFAULT '';
        CREATE TABLE invite (
          id INTEGER PRIMARY KEY,
          code_digest BLOB NOT NULL UNIQUE,
          label TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          used_at INTEGER,
          used_by TEXT,
          revoked_at INTEGER
        );
        PRAGMA user_version = 2;
      `);
    });
  }

  const count = db.prepare('SELECT COUNT(*) AS n FROM vault');
  const insert = db.prepare(
    `INSERT INTO vault (handle, vault_id, salt, auth_digest, wrapped_key, version, envelope, size, created_at, updated_at, rec_auth_digest, rec_wrapped_key)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
  );
  // Never `SELECT *`: the envelope columns are not part of authentication (see the header).
  const VAULT_COLUMNS =
    'id, handle, vault_id, salt, auth_digest, wrapped_key, version, size, prev_version, rec_auth_digest, rec_wrapped_key, created_at, updated_at';
  const byHandle = db.prepare(`SELECT ${VAULT_COLUMNS} FROM vault WHERE handle = ?`);
  const byRow = db.prepare(`SELECT ${VAULT_COLUMNS} FROM vault WHERE id = ?`);
  const bodyOf = db.prepare('SELECT envelope, prev_envelope FROM vault WHERE id = ?');
  const addDevice = db.prepare(
    'INSERT OR REPLACE INTO device (token_digest, vault_row, created_at, last_seen_at, label) VALUES (?, ?, ?, ?, ?)',
  );
  const trimDevices = db.prepare(
    `DELETE FROM device WHERE vault_row = ? AND token_digest NOT IN (
       SELECT token_digest FROM device WHERE vault_row = ?
       ORDER BY last_seen_at DESC, created_at DESC, rowid DESC LIMIT ?)`,
  );
  const device = db.prepare('SELECT vault_row, last_seen_at FROM device WHERE token_digest = ?');
  const seen = db.prepare('UPDATE device SET last_seen_at = ? WHERE token_digest = ?');
  // The envelope before is set aside as "previous" only when the one already set aside is older
  // than the window (or there is none): a burst of writes, or a thief with a token, replaces the
  // current version but cannot also replace the previous one within the window.
  const swap = db.prepare(
    `UPDATE vault SET
       prev_version = CASE WHEN prev_envelope IS NULL OR COALESCE(prev_at, 0) <= ? - ? THEN version ELSE prev_version END,
       prev_envelope = CASE WHEN prev_envelope IS NULL OR COALESCE(prev_at, 0) <= ? - ? THEN envelope ELSE prev_envelope END,
       prev_at = CASE WHEN prev_envelope IS NULL OR COALESCE(prev_at, 0) <= ? - ? THEN ? ELSE prev_at END,
       version = version + 1, envelope = ?, size = ?, updated_at = ?
     WHERE id = ? AND version = ?
       AND (? IS NULL OR EXISTS (SELECT 1 FROM device WHERE token_digest = ? AND vault_row = vault.id))`,
  );
  const listDevs = db.prepare(
    'SELECT rowid AS id, label, created_at, last_seen_at, token_digest FROM device WHERE vault_row = ? ORDER BY created_at, rowid',
  );
  const delDev = db.prepare('DELETE FROM device WHERE vault_row = ? AND rowid = ?');
  const delOthers = db.prepare('DELETE FROM device WHERE vault_row = ? AND token_digest != ?');
  const delExpired = db.prepare('DELETE FROM device WHERE token_digest = ?');
  const setCreds = db.prepare(
    'UPDATE vault SET salt = ?, auth_digest = ?, wrapped_key = ? WHERE id = ?',
  );
  const setRec = db.prepare(
    'UPDATE vault SET rec_auth_digest = ?, rec_wrapped_key = ? WHERE id = ?',
  );
  const delVault = db.prepare('DELETE FROM vault WHERE id = ?');
  const handleOf = db.prepare('SELECT handle FROM vault WHERE id = ?');
  const clearInviteUse = db.prepare('UPDATE invite SET used_by = NULL WHERE used_by = ?');
  const insInvite = db.prepare(
    'INSERT INTO invite (code_digest, label, created_at) VALUES (?, ?, ?)',
  );
  const useInvite = db.prepare(
    'UPDATE invite SET used_at = ?, used_by = ? WHERE code_digest = ? AND used_at IS NULL AND revoked_at IS NULL',
  );
  const peekInvite = db.prepare(
    'SELECT 1 AS ok FROM invite WHERE code_digest = ? AND used_at IS NULL AND revoked_at IS NULL',
  );
  const countInvites = db.prepare(
    'SELECT COUNT(*) AS n FROM invite WHERE used_at IS NULL AND revoked_at IS NULL',
  );
  const allInvites = db.prepare(
    'SELECT id, label, created_at, used_at, used_by, revoked_at FROM invite ORDER BY id',
  );
  const killInvite = db.prepare(
    'UPDATE invite SET revoked_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL',
  );
  const SUMMARY = `SELECT v.handle, v.size, v.version, v.created_at, v.updated_at,
      (SELECT MAX(last_seen_at) FROM device d WHERE d.vault_row = v.id) AS last_seen,
      (SELECT COUNT(*) FROM device d WHERE d.vault_row = v.id) AS devices,
      v.rec_auth_digest IS NOT NULL AS has_rec FROM vault v`;
  const summaries = db.prepare(`${SUMMARY} ORDER BY v.handle`);
  const versionOf = db.prepare('SELECT version FROM vault WHERE id = ?');

  const inTransaction = <T>(run: () => T): T => inTransactionOn(db, run);
  const summaryOf = (row: Row): VaultSummary => ({
    handle: String(row['handle']),
    size: Number(row['size']),
    version: Number(row['version']),
    createdAt: Number(row['created_at']),
    updatedAt: Number(row['updated_at']),
    lastSeenAt: row['last_seen'] === null ? null : Number(row['last_seen']),
    devices: Number(row['devices']),
    hasRecovery: Number(row['has_rec']) === 1,
  });

  return {
    vaultCount: () => Number((count.get() as { n: number }).n),

    createVault(vault, now) {
      try {
        return inTransaction((): 'created' | 'inviteInvalid' => {
          // The invite and the vault are one step: a handle that is taken does not burn the code.
          if (vault.inviteDigest !== undefined) {
            const used = useInvite.run(now, vault.handle, vault.inviteDigest);
            if (Number(used.changes) !== 1) return 'inviteInvalid';
          }
          insert.run(
            vault.handle,
            vault.vaultId,
            vault.salt,
            vault.authDigest,
            vault.wrappedKey,
            vault.envelope,
            vault.size,
            now,
            now,
            vault.recAuthDigest ?? null,
            vault.recWrappedKey ?? null,
          );
          return 'created';
        });
      } catch (error) {
        if (/UNIQUE/i.test(String((error as Error).message))) return 'handleTaken';
        throw error;
      }
    },

    vaultByHandle(handle) {
      const row = byHandle.get(handle) as Row | undefined;
      return row === undefined ? null : asVault(row);
    },

    vaultByRowId(rowId) {
      const row = byRow.get(rowId) as Row | undefined;
      return row === undefined ? null : asVault(row);
    },

    vaultBody(rowId) {
      const row = bodyOf.get(rowId) as Row | undefined;
      if (row === undefined) return null;
      return {
        envelope: String(row['envelope']),
        previousEnvelope: row['prev_envelope'] === null ? null : String(row['prev_envelope']),
      };
    },

    addDevice(rowId, tokenDigest, now, maxDevices, label = '') {
      inTransaction(() => {
        addDevice.run(tokenDigest, rowId, now, now, label);
        trimDevices.run(rowId, rowId, maxDevices);
      });
    },

    vaultForDevice(tokenDigest, now, maxIdleMs = 0) {
      const row = device.get(tokenDigest) as Row | undefined;
      if (row === undefined) return null;
      if (maxIdleMs > 0 && now - Number(row['last_seen_at']) >= maxIdleMs) {
        delExpired.run(tokenDigest);
        return null;
      }
      if (now - Number(row['last_seen_at']) >= SEEN_REFRESH_MS) seen.run(now, tokenDigest);
      return Number(row['vault_row']);
    },

    listDevices(rowId) {
      return (listDevs.all(rowId) as Row[]).map((r) => ({
        id: Number(r['id']),
        label: String(r['label']),
        createdAt: Number(r['created_at']),
        lastSeenAt: Number(r['last_seen_at']),
        tokenDigest: Buffer.from(r['token_digest'] as Uint8Array),
      }));
    },

    revokeDevice: (rowId, deviceId) => Number(delDev.run(rowId, deviceId).changes),
    revokeOtherDevices: (rowId, keep) => Number(delOthers.run(rowId, keep).changes),

    changeCredentials(rowId, keep, next) {
      return inTransaction(() => {
        setCreds.run(next.salt, next.authDigest, next.wrappedKey, rowId);
        return Number(delOthers.run(rowId, keep).changes);
      });
    },

    setRecovery(rowId, recovery) {
      setRec.run(recovery?.authDigest ?? null, recovery?.wrappedKey ?? null, rowId);
    },

    deleteVault(rowId) {
      // The handle goes with the copy: the invite that let it sign up keeps no trace of it.
      inTransaction(() => {
        const row = handleOf.get(rowId) as { handle: string } | undefined;
        if (row !== undefined) clearInviteUse.run(row.handle);
        delVault.run(rowId);
      });
    },

    createInvite(digest, label, now) {
      return Number(insInvite.run(digest, label, now).lastInsertRowid);
    },
    usableInvite: (digest) => peekInvite.get(digest) !== undefined,
    usableInviteCount: () => Number((countInvites.get() as { n: number }).n),
    listInvites: () =>
      (allInvites.all() as Row[]).map((r) => ({
        id: Number(r['id']),
        label: String(r['label']),
        createdAt: Number(r['created_at']),
        usedAt: r['used_at'] === null ? null : Number(r['used_at']),
        usedBy: r['used_by'] === null ? null : String(r['used_by']),
        revokedAt: r['revoked_at'] === null ? null : Number(r['revoked_at']),
      })),
    revokeInvite: (id, now) => Number(killInvite.run(now, id).changes) === 1,

    listVaults: () => (summaries.all() as Row[]).map(summaryOf),
    idleVaults: (now, idleMs) =>
      (summaries.all() as Row[])
        .map(summaryOf)
        .filter((v) => now - Math.max(v.updatedAt, v.lastSeenAt ?? 0) >= idleMs)
        .sort(
          (a, b) =>
            Math.max(a.updatedAt, a.lastSeenAt ?? 0) - Math.max(b.updatedAt, b.lastSeenAt ?? 0),
        ),

    putEnvelope(rowId, expectedVersion, envelope, size, now, keepPreviousMs = 0, byDevice) {
      return inTransaction((): PutResult => {
        const result = swap.run(
          now,
          keepPreviousMs,
          now,
          keepPreviousMs,
          now,
          keepPreviousMs,
          now,
          envelope,
          size,
          now,
          rowId,
          expectedVersion,
          byDevice ?? null,
          byDevice ?? null,
        );
        if (Number(result.changes) === 1) return { kind: 'stored', version: expectedVersion + 1 };
        // The write did not land: a token revoked in the meantime is "unauthorized", not a conflict.
        if (byDevice !== undefined && device.get(byDevice) === undefined) {
          return { kind: 'conflict', version: null };
        }
        const current = versionOf.get(rowId) as { version: number } | undefined;
        return {
          kind: 'conflict',
          version: current === undefined ? null : Number(current.version),
        };
      });
    },

    close: () => db.close(),
  };
}
