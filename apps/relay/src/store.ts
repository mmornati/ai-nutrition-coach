// The relay's storage: one SQLite file. A vault row holds what the relay needs to authenticate and
// serve a person: the handle, the salt, a keyed hash of the passphrase proof, the wrapped vault key
// and the sealed envelope (the current one and the one before). The relay never decrypts anything,
// and the only way in for vault content is `putEnvelope`, which takes an envelope that already
// passed the strict parser.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_VERSION = 1;

export interface VaultRow {
  readonly rowId: number;
  readonly handle: string;
  readonly vaultId: string;
  readonly salt: string;
  readonly authDigest: Buffer;
  readonly wrappedKey: string;
  readonly version: number;
  /** The envelope JSON, exactly as stored. */
  readonly envelope: string;
  readonly size: number;
  readonly previousVersion: number | null;
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
}

export type PutResult =
  | { readonly kind: 'stored'; readonly version: number }
  /** The vault is at another version than the caller expected (or is gone). */
  | { readonly kind: 'conflict'; readonly version: number | null };

export interface RelayStore {
  vaultCount(): number;
  createVault(vault: NewVault, now: number): 'created' | 'handleTaken';
  vaultByHandle(handle: string): VaultRow | null;
  vaultByRowId(rowId: number): VaultRow | null;
  /**
   * Records a device token for a vault, dropping the ones used least recently past `maxDevices`
   * (so a phone that syncs every day is not signed out by a pile of look-ups made since).
   */
  addDevice(rowId: number, tokenDigest: Buffer, now: number, maxDevices: number): void;
  /** The vault row id a device token belongs to; refreshes "last seen" at most once a minute. */
  vaultForDevice(tokenDigest: Buffer, now: number): number | null;
  /** Compare-and-swap: replaces the envelope only when the vault is at `expectedVersion`. */
  putEnvelope(
    rowId: number,
    expectedVersion: number,
    envelope: string,
    size: number,
    now: number,
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
    envelope: String(row['envelope']),
    size: Number(row['size']),
    previousVersion: row['prev_version'] === null ? null : Number(row['prev_version']),
    previousEnvelope: row['prev_envelope'] === null ? null : String(row['prev_envelope']),
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

function createStore(db: DatabaseSync): RelayStore {
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL;');
  const found = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (found.user_version > SCHEMA_VERSION) {
    throw new Error('The relay database was made by a newer version of the relay.');
  }
  if (found.user_version < SCHEMA_VERSION) {
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
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }

  const count = db.prepare('SELECT COUNT(*) AS n FROM vault');
  const insert = db.prepare(
    `INSERT INTO vault (handle, vault_id, salt, auth_digest, wrapped_key, version, envelope, size, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
  );
  const byHandle = db.prepare('SELECT * FROM vault WHERE handle = ?');
  const byRow = db.prepare('SELECT * FROM vault WHERE id = ?');
  const addDevice = db.prepare(
    'INSERT OR REPLACE INTO device (token_digest, vault_row, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
  );
  const trimDevices = db.prepare(
    `DELETE FROM device WHERE vault_row = ? AND token_digest NOT IN (
       SELECT token_digest FROM device WHERE vault_row = ?
       ORDER BY last_seen_at DESC, created_at DESC, rowid DESC LIMIT ?)`,
  );
  const device = db.prepare('SELECT vault_row, last_seen_at FROM device WHERE token_digest = ?');
  const seen = db.prepare('UPDATE device SET last_seen_at = ? WHERE token_digest = ?');
  const swap = db.prepare(
    `UPDATE vault SET prev_version = version, prev_envelope = envelope,
       version = version + 1, envelope = ?, size = ?, updated_at = ?
     WHERE id = ? AND version = ?`,
  );
  const versionOf = db.prepare('SELECT version FROM vault WHERE id = ?');

  const inTransaction = <T>(run: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = run();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };

  return {
    vaultCount: () => Number((count.get() as { n: number }).n),

    createVault(vault, now) {
      try {
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
        );
        return 'created';
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

    addDevice(rowId, tokenDigest, now, maxDevices) {
      inTransaction(() => {
        addDevice.run(tokenDigest, rowId, now, now);
        trimDevices.run(rowId, rowId, maxDevices);
      });
    },

    vaultForDevice(tokenDigest, now) {
      const row = device.get(tokenDigest) as Row | undefined;
      if (row === undefined) return null;
      if (now - Number(row['last_seen_at']) >= SEEN_REFRESH_MS) seen.run(now, tokenDigest);
      return Number(row['vault_row']);
    },

    putEnvelope(rowId, expectedVersion, envelope, size, now) {
      return inTransaction((): PutResult => {
        const result = swap.run(envelope, size, now, rowId, expectedVersion);
        if (Number(result.changes) === 1) return { kind: 'stored', version: expectedVersion + 1 };
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
