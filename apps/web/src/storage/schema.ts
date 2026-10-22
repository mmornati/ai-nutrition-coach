// Schema version 4 (v1 -> v2 adds grams and per-100 g nutrients to food_entry; docs/adr/0006;
// v2 -> v3 adds the person's saved meals and home recipes, with their items; v3 -> v4 gives every
// synced row a `uid`, stamps the mutable records, and adds tombstones, the groundwork for an
// encrypted backup and sync: docs/encrypted-sync-plan.md §3.4).
//
// Tables:
//   plate_log         one row per logged meal
//   food_entry        denormalised food + quantity low/high + food_group (+ v2: grams, nutrient snapshot),
//                     back-referenced to the plate
//   coach_note        one row per post-resolve coach note
//   coach_interaction append-only record of one user action against a coach note
//   coach_dismissal   durable "quiet" markers for dismissed whispers and open-plate hints
//   kv                small encrypted key/value facts (AI settings, BYOK key, last export, ...)
//   saved_meal        (v3) a named template of foods the person chose to keep
//   saved_meal_item   (v3) its entries, in order, same food snapshot columns as food_entry
//   recipe            (v3) a home recipe: name, servings, optional cooked weight
//   recipe_item       (v3) its ingredients, in order, same food snapshot columns
//   tombstone         (v4) one row per deleted synced record: its uid, its table and when (an HLC stamp)
//
// v4 columns: `uid TEXT` (UUIDv7, unique) on plate_log, food_entry, coach_note, coach_interaction,
// saved_meal, saved_meal_item, recipe and recipe_item; `updated_at_hlc TEXT` on saved_meal and
// recipe (set on create and on every change) and on kv. The stamp lives ON the kv row rather than
// in a `kv_meta` side table: the value and its stamp are then written by one upsert and can never
// disagree, a delete cannot leave an orphan, and the snapshot reads one table. A deleted kv key is
// remembered as a tombstone (`kv:<key>`), so a delete can win a merge. The integer ids stay: they
// are internal to a store and never cross to another device; `uid` is the identity that does.
// `uid` is nullable in the table (SQLite cannot add a NOT NULL column without a default) but a
// BEFORE INSERT trigger per table refuses a NULL, so no row is ever written without one. A tombstone
// is keyed by (table_name, uid): the same uid in another table is another record.
//
// There are deliberately NO database-level foreign keys: the references are enforced in use-cases,
// and the delete cascade is one explicit transaction (which also writes the tombstones). There is
// NO sync table: there is no sync transport yet, so the outbox is in memory.
//
// Timestamps are UTC ISO-8601 TEXT at MILLISECOND precision (`toISOString()`), so fixed-width
// strings sort exactly like the instants they encode and a `[from, to)` text comparison is exact.
//
// Versioning: `PRAGMA user_version`. A database from a NEWER schema is refused (never run old code
// over a newer layout). Migrations, when they exist, are appended to MIGRATIONS and must be safely
// re-runnable (`IF NOT EXISTS`, check-before-alter), each in one transaction.

import {
  createUuidV7Generator,
  deviceIdFromBytes,
  formatHlc,
  isDeviceId,
  ZERO_HLC,
} from '@anc/core';
import { SCHEMA_VERSION } from './constants';
import { SchemaTooNewError, StoreOpenError } from './errors';
import type { SqlHandle } from './sql-handle';
import { DEVICE_ID_KV_KEY, systemVaultEnv, type VaultEnv } from './vault-clock';

export const TABLE_NAMES = [
  'plate_log',
  'food_entry',
  'coach_note',
  'coach_interaction',
  'coach_dismissal',
  'kv',
  'saved_meal',
  'saved_meal_item',
  'recipe',
  'recipe_item',
  'tombstone',
] as const;

export const CREATE_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS plate_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     logged_at_utc TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS food_entry (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     plate_log_id INTEGER NOT NULL,
     source_ref TEXT NOT NULL,
     display_name TEXT NOT NULL,
     source TEXT NOT NULL,
     food_group TEXT NOT NULL DEFAULT 'other',
     quantity_low TEXT NOT NULL,
     quantity_high TEXT NOT NULL,
     quantity_unit TEXT NOT NULL,
     quantity_display_label TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS coach_note (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     plate_log_id INTEGER NOT NULL,
     anchor TEXT NOT NULL,
     question_key TEXT NOT NULL,
     note_text TEXT NOT NULL,
     generated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS coach_interaction (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     coach_note_id INTEGER NOT NULL,
     kind TEXT NOT NULL,
     at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS coach_dismissal (
     dismissal_key TEXT NOT NULL PRIMARY KEY,
     dismissed_at_utc TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS kv (
     key TEXT NOT NULL PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS idx_plate_logged_at ON plate_log (logged_at_utc)',
  'CREATE INDEX IF NOT EXISTS idx_entry_plate ON food_entry (plate_log_id)',
  'CREATE INDEX IF NOT EXISTS idx_note_plate ON coach_note (plate_log_id)',
];

/** Nullable TEXT columns added to `food_entry` by schema v2 (`quantity_grams_estimated` holds 0/1). */
const V2_FOOD_ENTRY_COLUMNS = [
  'quantity_grams',
  'quantity_grams_estimated',
  'nutrients_per_100g',
  'food_extra',
] as const;

/** The food snapshot columns shared by `saved_meal_item` and `recipe_item` (the same as food_entry). */
const ITEM_COLUMNS = `position INTEGER NOT NULL,
     source_ref TEXT NOT NULL,
     display_name TEXT NOT NULL,
     source TEXT NOT NULL,
     food_group TEXT NOT NULL DEFAULT 'other',
     quantity_low TEXT NOT NULL,
     quantity_high TEXT NOT NULL,
     quantity_unit TEXT NOT NULL,
     quantity_display_label TEXT NOT NULL,
     quantity_grams TEXT,
     quantity_grams_estimated TEXT,
     nutrients_per_100g TEXT,
     food_extra TEXT`;

/**
 * v3: the person's templates. Only new tables and indexes, every statement `IF NOT EXISTS`, so
 * re-running after a rolled-back user_version changes nothing and loses no row.
 */
export const V3_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS saved_meal (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     created_at_utc TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS saved_meal_item (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     saved_meal_id INTEGER NOT NULL,
     ${ITEM_COLUMNS}
   )`,
  `CREATE TABLE IF NOT EXISTS recipe (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     servings INTEGER NOT NULL,
     cooked_weight_grams TEXT,
     created_at_utc TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS recipe_item (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     recipe_id INTEGER NOT NULL,
     ${ITEM_COLUMNS}
   )`,
  'CREATE INDEX IF NOT EXISTS idx_saved_meal_item_meal ON saved_meal_item (saved_meal_id)',
  'CREATE INDEX IF NOT EXISTS idx_recipe_item_recipe ON recipe_item (recipe_id)',
];

/** The tables whose rows get a `uid` in v4, in the order the backfill visits them. */
const V4_UID_TABLES = [
  'plate_log',
  'food_entry',
  'coach_note',
  'coach_interaction',
  'saved_meal',
  'saved_meal_item',
  'recipe',
  'recipe_item',
] as const;

/** The stamp of a record written before v4: its creation time, on a device that never existed. */
const LEGACY_DEVICE_ID = '0000000000000000';

function legacyStamp(createdAtUtc: string | number | null): string {
  const wallMs = Date.parse(String(createdAtUtc));
  return formatHlc({
    wallMs: Number.isFinite(wallMs) && wallMs > 0 ? wallMs : 0,
    counter: 0,
    deviceId: LEGACY_DEVICE_ID,
  });
}

function columnsOf(db: SqlHandle, table: string): Set<string> {
  return new Set(db.all(`PRAGMA table_info(${table})`).map((r) => String(r['name'])));
}

/**
 * v3 -> v4. Every step is check-before-alter / `IF NOT EXISTS`, and the backfill only touches rows
 * still NULL, so re-running after a rolled-back user_version changes nothing and loses no row.
 * Existing rows keep their integer ids and every other column; they only gain a uid (a UUIDv7
 * minted at migration time, in id order within each table, so uid order matches id order for these
 * rows; their creation time is not encoded) and, for saved meals and recipes, a legacy stamp derived
 * from their creation time. The device gets its id here, and settings written before v4 are stamped
 * with wall time 0 on THAT device: they lose to any real write, and two devices' legacy values for
 * one key are still ordered by device id (a tie would otherwise be broken by content).
 */
function migrateToV4(db: SqlHandle, env: VaultEnv): void {
  // One monotonic generator for the whole backfill: uids are minted in the order rows are visited.
  const newUid = createUuidV7Generator(env.randomBytes, env.now);
  for (const table of V4_UID_TABLES) {
    if (!columnsOf(db, table).has('uid')) db.run(`ALTER TABLE ${table} ADD COLUMN uid TEXT`);
    for (const row of db.all(`SELECT id FROM ${table} WHERE uid IS NULL ORDER BY id ASC`)) {
      db.run(`UPDATE ${table} SET uid = ? WHERE id = ?`, [newUid(), row['id'] ?? null]);
    }
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uid ON ${table} (uid)`);
    db.run(
      `CREATE TRIGGER IF NOT EXISTS trg_${table}_uid_required BEFORE INSERT ON ${table}
         WHEN NEW.uid IS NULL BEGIN SELECT RAISE(ABORT, 'uid is required'); END`,
    );
  }
  for (const table of ['saved_meal', 'recipe'] as const) {
    if (!columnsOf(db, table).has('updated_at_hlc')) {
      db.run(`ALTER TABLE ${table} ADD COLUMN updated_at_hlc TEXT`);
    }
    for (const row of db.all(
      `SELECT id, created_at_utc FROM ${table} WHERE updated_at_hlc IS NULL`,
    )) {
      db.run(`UPDATE ${table} SET updated_at_hlc = ? WHERE id = ?`, [
        legacyStamp(row['created_at_utc'] ?? null),
        row['id'] ?? null,
      ]);
    }
  }
  if (!columnsOf(db, 'kv').has('updated_at_hlc')) {
    db.run('ALTER TABLE kv ADD COLUMN updated_at_hlc TEXT');
  }
  const known = db.all('SELECT value FROM kv WHERE key = ?', [DEVICE_ID_KV_KEY])[0]?.['value'];
  const deviceId = isDeviceId(known) ? known : deviceIdFromBytes(env.randomBytes(8));
  db.run('INSERT OR REPLACE INTO kv (key, value, updated_at_hlc) VALUES (?, ?, ?)', [
    DEVICE_ID_KV_KEY,
    deviceId,
    ZERO_HLC,
  ]);
  // A setting written before v4 has no known time: it loses to any real write.
  db.run('UPDATE kv SET updated_at_hlc = ? WHERE updated_at_hlc IS NULL', [
    formatHlc({ wallMs: 0, counter: 0, deviceId }),
  ]);
  db.run(`CREATE TABLE IF NOT EXISTS tombstone (
     uid TEXT NOT NULL,
     table_name TEXT NOT NULL,
     deleted_at_hlc TEXT NOT NULL,
     PRIMARY KEY (table_name, uid)
   )`);
}

/** Step `n` (0-based) upgrades a database from version n to n + 1. Each must be re-runnable. */
const MIGRATIONS: readonly ((db: SqlHandle, env: VaultEnv) => void)[] = [
  (db) => {
    for (const statement of CREATE_STATEMENTS) db.run(statement);
  },
  // v2 (docs/adr/0006): grams per entry and a snapshot of the food's per-100 g nutrients.
  // Check-before-alter, so re-running after a rolled-back user_version is a no-op.
  (db) => {
    const have = new Set(db.all('PRAGMA table_info(food_entry)').map((r) => String(r['name'])));
    for (const column of V2_FOOD_ENTRY_COLUMNS) {
      if (!have.has(column)) db.run(`ALTER TABLE food_entry ADD COLUMN ${column} TEXT`);
    }
  },
  // v3: saved meals and recipes (forward-only, like v2).
  (db) => {
    for (const statement of V3_STATEMENTS) db.run(statement);
  },
  // v4: uid, updated_at_hlc, tombstone (see the header of this file).
  migrateToV4,
];

if (MIGRATIONS.length !== SCHEMA_VERSION) {
  throw new Error('SCHEMA_VERSION and MIGRATIONS are out of step');
}

function userVersion(db: SqlHandle): number {
  const row = db.all('PRAGMA user_version')[0];
  const value = row ? Object.values(row)[0] : 0;
  return typeof value === 'number' ? value : 0;
}

function tableCount(db: SqlHandle): number {
  const row = db.all('SELECT count(*) AS n FROM sqlite_master')[0];
  return typeof row?.['n'] === 'number' ? row['n'] : 0;
}

/**
 * Bring an already-keyed database to the current schema.
 * `expectExisting` is true for a returning user: the database MUST already hold a schema,
 * otherwise the open is refused (`dataMissing`) instead of minting an empty store that any
 * passphrase would "open".
 */
export function ensureSchema(
  db: SqlHandle,
  expectExisting: boolean,
  env: VaultEnv = systemVaultEnv,
): void {
  if (expectExisting && tableCount(db) === 0) throw new StoreOpenError('dataMissing');
  const found = userVersion(db);
  if (found > SCHEMA_VERSION) throw new SchemaTooNewError(found, SCHEMA_VERSION);
  migrateTo(db, SCHEMA_VERSION, env);
}

/** Run the steps from the database's `user_version` up to `target` (the tests stop short of the latest). */
export function migrateTo(db: SqlHandle, target: number, env: VaultEnv = systemVaultEnv): void {
  const found = userVersion(db);
  for (let from = found; from < target; from++) {
    const step = MIGRATIONS[from];
    if (!step) throw new SchemaTooNewError(found, SCHEMA_VERSION);
    db.transaction(() => {
      step(db, env);
      db.run(`PRAGMA user_version = ${from + 1}`);
    });
  }
}
