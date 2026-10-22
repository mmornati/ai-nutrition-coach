// Row-level writes shared by the store's own operations (sqlite-store-db.ts) and by applying a vault
// snapshot (sqlite-vault.ts), so a row looks the same however it got there. The table, column and
// WHERE fragments are fixed strings from the two callers, never input.

import type { TombstoneTable } from '@anc/core';
import type { EntryInsert } from './ops';
import type { SqlHandle, SqlValue } from './sql-handle';

export const text = (value: SqlValue | undefined): string =>
  value === null || value === undefined ? '' : String(value);
export const nullableText = (value: SqlValue | undefined): string | null =>
  value === null || value === undefined ? null : String(value);
export const nullableInt = (value: SqlValue | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
export const int = (value: SqlValue | undefined): number => Number(value ?? 0);

/** Tables whose rows carry a `uid` (schema v4); `kv` is keyed by its own key instead. */
export type UidTable = Exclude<TombstoneTable, 'kv'>;
export type SavedItemTable = 'saved_meal_item' | 'recipe_item';
export type SavedItemParent = 'saved_meal_id' | 'recipe_id';

export function insertEntryRow(
  db: SqlHandle,
  plateId: number,
  uid: string,
  e: EntryInsert,
): number {
  db.run(
    `INSERT INTO food_entry (uid, plate_log_id, source_ref, display_name, source, food_group,
       quantity_low, quantity_high, quantity_unit, quantity_display_label,
       quantity_grams, quantity_grams_estimated, nutrients_per_100g, food_extra)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uid,
      plateId,
      e.sourceRef,
      e.displayName,
      e.source,
      e.foodGroup,
      e.quantityLow,
      e.quantityHigh,
      e.quantityUnit,
      e.quantityDisplayLabel,
      e.quantityGrams ?? null,
      e.quantityGramsEstimated ?? null,
      e.nutrientsPer100g ?? null,
      e.foodExtra ?? null,
    ],
  );
  return db.lastInsertRowid();
}

export function insertItemRow(
  db: SqlHandle,
  at: {
    readonly table: SavedItemTable;
    readonly parent: SavedItemParent;
    readonly parentId: number;
    readonly position: number;
    readonly uid: string;
  },
  e: EntryInsert,
): void {
  db.run(
    `INSERT INTO ${at.table} (uid, ${at.parent}, position, source_ref, display_name, source,
       food_group, quantity_low, quantity_high, quantity_unit, quantity_display_label,
       quantity_grams, quantity_grams_estimated, nutrients_per_100g, food_extra)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      at.uid,
      at.parentId,
      at.position,
      e.sourceRef,
      e.displayName,
      e.source,
      e.foodGroup,
      e.quantityLow,
      e.quantityHigh,
      e.quantityUnit,
      e.quantityDisplayLabel,
      e.quantityGrams ?? null,
      e.quantityGramsEstimated ?? null,
      e.nutrientsPer100g ?? null,
      e.foodExtra ?? null,
    ],
  );
}

/** Record a deletion; if the uid is already tombstoned the later stamp is kept. */
export function upsertTombstone(
  db: SqlHandle,
  uid: string,
  table: TombstoneTable,
  stamp: string,
): void {
  db.run(
    `INSERT INTO tombstone (uid, table_name, deleted_at_hlc) VALUES (?, ?, ?)
     ON CONFLICT(table_name, uid) DO UPDATE SET deleted_at_hlc = excluded.deleted_at_hlc
       WHERE excluded.deleted_at_hlc > tombstone.deleted_at_hlc`,
    [uid, table, stamp],
  );
}

/**
 * One tombstone per row of `table` matching `where`, read from the rows themselves (nothing is
 * pulled into JS). The `WHERE` after the SELECT is what SQLite requires before an upsert clause.
 */
export function tombstoneRowsWhere(
  db: SqlHandle,
  table: UidTable,
  where: string,
  bind: readonly SqlValue[],
  stamp: string,
): void {
  db.run(
    `INSERT INTO tombstone (uid, table_name, deleted_at_hlc)
     SELECT uid, '${table}', ? FROM ${table} WHERE ${where} AND uid IS NOT NULL
     ON CONFLICT(table_name, uid) DO UPDATE SET deleted_at_hlc = excluded.deleted_at_hlc
       WHERE excluded.deleted_at_hlc > tombstone.deleted_at_hlc`,
    [stamp, ...bind],
  );
}
