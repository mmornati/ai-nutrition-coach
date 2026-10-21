// Schema version 2 (v1 -> v2 adds grams and per-100 g nutrients to food_entry; docs/adr/0006).
//
// Tables:
//   plate_log         one row per logged meal
//   food_entry        denormalised food + quantity low/high + food_group (+ v2: grams, nutrient snapshot),
//                     back-referenced to the plate
//   coach_note        one row per post-resolve coach note
//   coach_interaction append-only record of one user action against a coach note
//   coach_dismissal   durable "quiet" markers for dismissed whispers and open-plate hints
//   kv                small encrypted key/value facts (AI settings, BYOK key, last export, ...)
//
// There are deliberately NO database-level foreign keys: the references are enforced in use-cases,
// and the delete cascade is one explicit transaction. There is NO sync table: v1 has no sync
// transport, so the outbox is in memory.
//
// Timestamps are UTC ISO-8601 TEXT at MILLISECOND precision (`toISOString()`), so fixed-width
// strings sort exactly like the instants they encode and a `[from, to)` text comparison is exact.
//
// Versioning: `PRAGMA user_version`. A database from a NEWER schema is refused (never run old code
// over a newer layout). Migrations, when they exist, are appended to MIGRATIONS and must be safely
// re-runnable (`IF NOT EXISTS`, check-before-alter), each in one transaction.

import { SCHEMA_VERSION } from './constants';
import { SchemaTooNewError, StoreOpenError } from './errors';
import type { SqlHandle } from './sql-handle';

export const TABLE_NAMES = [
  'plate_log',
  'food_entry',
  'coach_note',
  'coach_interaction',
  'coach_dismissal',
  'kv',
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

/** Step `n` (0-based) upgrades a database from version n to n + 1. Each must be re-runnable. */
const MIGRATIONS: readonly ((db: SqlHandle) => void)[] = [
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
export function ensureSchema(db: SqlHandle, expectExisting: boolean): void {
  if (expectExisting && tableCount(db) === 0) throw new StoreOpenError('dataMissing');
  const found = userVersion(db);
  if (found > SCHEMA_VERSION) throw new SchemaTooNewError(found, SCHEMA_VERSION);
  for (let from = found; from < SCHEMA_VERSION; from++) {
    const step = MIGRATIONS[from];
    if (!step) throw new SchemaTooNewError(found, SCHEMA_VERSION);
    db.transaction(() => {
      step(db);
      db.run(`PRAGMA user_version = ${from + 1}`);
    });
  }
}
