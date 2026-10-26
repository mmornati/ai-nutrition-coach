// `StoreDbOps` over the (already keyed) SQLite database. Runs inside the worker. The SQL for the
// store is here; the row-level writes it shares with the vault snapshot are in sqlite-rows.ts, and
// reading / applying a whole snapshot is sqlite-vault.ts.

import { isSyncedKvKey, kvTombstoneUid, ZERO_HLC, type VaultSnapshot } from '@anc/core';
import type {
  EntryInsert,
  EntryRow,
  InsertedPlate,
  NoteInsert,
  NoteRow,
  PlateRow,
  PlateRowSet,
  PlateUidRow,
  RecipeRow,
  RecipeSet,
  SavedItemRow,
  SavedMealRow,
  SavedMealSet,
  StoreDbOps,
} from './ops';
import type { SqlHandle, SqlRow, SqlValue } from './sql-handle';
import {
  int,
  nullableInt,
  nullableText,
  text,
  insertEntryRow,
  insertItemRow,
  tombstoneRowsWhere,
  upsertTombstone,
  type SavedItemParent,
  type SavedItemTable,
  type UidTable,
} from './sqlite-rows';
import { applyVaultSnapshot, readVaultSnapshot } from './sqlite-vault';
import {
  DEVICE_ID_KV_KEY,
  systemVaultEnv,
  VaultClock,
  type VaultApplyOutcome,
  type VaultEnv,
} from './vault-clock';

const UID_TABLES: readonly UidTable[] = [
  'plate_log',
  'food_entry',
  'coach_note',
  'coach_interaction',
  'saved_meal',
  'saved_meal_item',
  'recipe',
  'recipe_item',
];

export class SqliteStoreDb implements StoreDbOps {
  private readonly clock: VaultClock;

  constructor(
    private readonly db: SqlHandle,
    env: VaultEnv = systemVaultEnv,
  ) {
    this.clock = new VaultClock(env, {
      readDeviceId: () =>
        nullableText(
          this.db.all('SELECT value FROM kv WHERE key = ?', [DEVICE_ID_KV_KEY])[0]?.['value'],
        ),
      writeDeviceId: (id) =>
        this.db.run('INSERT OR REPLACE INTO kv (key, value, updated_at_hlc) VALUES (?, ?, ?)', [
          DEVICE_ID_KV_KEY,
          id,
          ZERO_HLC,
        ]),
      newestStamp: () =>
        nullableText(
          this.db.all(
            `SELECT max(h) AS newest FROM (
               SELECT max(updated_at_hlc) AS h FROM saved_meal
               UNION ALL SELECT max(updated_at_hlc) FROM recipe
               UNION ALL SELECT max(updated_at_hlc) FROM kv
               UNION ALL SELECT max(deleted_at_hlc) FROM tombstone)`,
          )[0]?.['newest'],
        ),
      newestUid: () =>
        nullableText(
          this.db.all(
            `SELECT max(u) AS newest FROM (${UID_TABLES.map((t) => `SELECT max(uid) AS u FROM ${t}`).join(' UNION ALL ')})`,
          )[0]?.['newest'],
        ),
    });
    // The device id is made now, once, outside any transaction.
    this.clock.ensureDevice();
  }

  insertPlate(loggedAtUtc: string, entries: readonly EntryInsert[]): InsertedPlate {
    return this.db.transaction(() => {
      this.db.run('INSERT INTO plate_log (uid, logged_at_utc) VALUES (?, ?)', [
        this.clock.newUid(),
        loggedAtUtc,
      ]);
      const plateId = this.db.lastInsertRowid();
      const entryIds: number[] = [];
      for (const e of entries)
        entryIds.push(insertEntryRow(this.db, plateId, this.clock.newUid(), e));
      return { plateId, entryIds };
    });
  }

  readPlateRows(fromUtc: string | null, toUtc: string | null): PlateRowSet {
    // ONE join query (plates LEFT JOIN entries) bounded to `[from, to)` on the UTC text, grouped
    // in the caller: no per-plate follow-up query. The range is served by idx_plate_logged_at (and
    // the entries by idx_entry_plate), so the cost follows the range, not the history.
    const conditions: string[] = [];
    const bind: SqlValue[] = [];
    if (fromUtc !== null) {
      conditions.push('p.logged_at_utc >= ?');
      bind.push(fromUtc);
    }
    if (toUtc !== null) {
      conditions.push('p.logged_at_utc < ?');
      bind.push(toUtc);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.all(
      `SELECT p.id AS plate_id, p.logged_at_utc AS logged_at_utc,
              e.id AS entry_id, e.plate_log_id AS plate_log_id, e.source_ref AS source_ref,
              e.display_name AS display_name, e.source AS source, e.food_group AS food_group,
              e.quantity_low AS quantity_low, e.quantity_high AS quantity_high,
              e.quantity_unit AS quantity_unit, e.quantity_display_label AS quantity_display_label,
              e.quantity_grams AS quantity_grams,
              e.quantity_grams_estimated AS quantity_grams_estimated,
              e.nutrients_per_100g AS nutrients_per_100g, e.food_extra AS food_extra
         FROM plate_log p LEFT JOIN food_entry e ON e.plate_log_id = p.id
         ${where}
        ORDER BY p.logged_at_utc DESC, p.id DESC, e.id ASC`,
      bind,
    );
    const plates: PlateRow[] = [];
    const entries: EntryRow[] = [];
    let lastPlate = -1;
    for (const r of rows) {
      const plateId = int(r['plate_id']);
      if (plateId !== lastPlate) {
        plates.push({ id: plateId, loggedAtUtc: text(r['logged_at_utc']) });
        lastPlate = plateId;
      }
      if (r['entry_id'] !== null && r['entry_id'] !== undefined) entries.push(toEntry(r));
    }
    return { plates, entries };
  }

  deletePlate(plateLogId: number): void {
    // Set-based sub-selects (nothing is read into JS): the note ids and their dismissal keys. The
    // tombstones are written first (they read the rows about to go), in the SAME transaction, with
    // one stamp for the whole delete: a delete that rolls back leaves no tombstone behind.
    this.db.transaction(() => {
      const stamp = this.clock.stamp();
      tombstoneRowsWhere(this.db, 'food_entry', 'plate_log_id = ?', [plateLogId], stamp);
      this.deleteNotesInTransaction(plateLogId, stamp);
      tombstoneRowsWhere(this.db, 'plate_log', 'id = ?', [plateLogId], stamp);
      this.db.run('DELETE FROM food_entry WHERE plate_log_id = ?', [plateLogId]);
      this.db.run('DELETE FROM plate_log WHERE id = ?', [plateLogId]);
    });
  }

  insertNote(note: NoteInsert): number {
    this.db.run(
      `INSERT INTO coach_note (uid, plate_log_id, anchor, question_key, note_text, generated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        this.clock.newUid(),
        note.plateLogId,
        note.anchor,
        note.questionKey,
        note.noteText,
        note.generatedAt,
      ],
    );
    return this.db.lastInsertRowid();
  }

  notesForPlate(plateLogId: number): NoteRow[] {
    return this.db
      .all(
        `SELECT id, plate_log_id, anchor, question_key, note_text, generated_at
           FROM coach_note WHERE plate_log_id = ? ORDER BY id ASC`,
        [plateLogId],
      )
      .map((r) => ({
        id: int(r['id']),
        plateLogId: int(r['plate_log_id']),
        anchor: text(r['anchor']),
        questionKey: text(r['question_key']),
        noteText: text(r['note_text']),
        generatedAt: text(r['generated_at']),
      }));
  }

  insertDismissal(key: string, atUtc: string): number {
    this.db.run(
      'INSERT OR IGNORE INTO coach_dismissal (dismissal_key, dismissed_at_utc) VALUES (?, ?)',
      [key, atUtc],
    );
    const row = this.db.all('SELECT rowid AS id FROM coach_dismissal WHERE dismissal_key = ?', [
      key,
    ])[0];
    return int(row?.['id']);
  }

  dismissalKeys(): string[] {
    return this.db
      .all('SELECT dismissal_key FROM coach_dismissal')
      .map((r) => text(r['dismissal_key']));
  }

  pruneOpenPlateDismissals(cutoffDay: string): void {
    // `openPlate:` is 10 characters, so the ISO date starts at position 11 and compares as text.
    this.db.run(
      `DELETE FROM coach_dismissal
        WHERE dismissal_key LIKE 'openPlate:%' AND substr(dismissal_key, 11, 10) < ?`,
      [cutoffDay],
    );
  }

  insertInteraction(coachNoteId: number, kind: string, atUtc: string): number {
    this.db.run(
      'INSERT INTO coach_interaction (uid, coach_note_id, kind, at) VALUES (?, ?, ?, ?)',
      [this.clock.newUid(), coachNoteId, kind, atUtc],
    );
    return this.db.lastInsertRowid();
  }

  deleteNotesForPlate(plateLogId: number): void {
    this.db.transaction(() => this.deleteNotesInTransaction(plateLogId, this.clock.stamp()));
  }

  private deleteNotesInTransaction(plateLogId: number, stamp: string): void {
    const ofPlate = 'SELECT id FROM coach_note WHERE plate_log_id = ?';
    tombstoneRowsWhere(
      this.db,
      'coach_interaction',
      `coach_note_id IN (${ofPlate})`,
      [plateLogId],
      stamp,
    );
    tombstoneRowsWhere(this.db, 'coach_note', 'plate_log_id = ?', [plateLogId], stamp);
    this.db.run(
      `DELETE FROM coach_interaction
        WHERE coach_note_id IN (SELECT id FROM coach_note WHERE plate_log_id = ?)`,
      [plateLogId],
    );
    // `coachNoteDismissalKey`: `note:<id>`.
    this.db.run(
      `DELETE FROM coach_dismissal
        WHERE dismissal_key IN (SELECT 'note:' || id FROM coach_note WHERE plate_log_id = ?)`,
      [plateLogId],
    );
    this.db.run('DELETE FROM coach_note WHERE plate_log_id = ?', [plateLogId]);
  }

  insertSavedMeal(name: string, createdAtUtc: string, items: readonly EntryInsert[]): number {
    return this.db.transaction(() => {
      this.db.run(
        'INSERT INTO saved_meal (uid, name, created_at_utc, updated_at_hlc) VALUES (?, ?, ?, ?)',
        [this.clock.newUid(), name, createdAtUtc, this.clock.stamp()],
      );
      const id = this.db.lastInsertRowid();
      this.insertItems('saved_meal_item', 'saved_meal_id', id, items);
      return id;
    });
  }

  readSavedMeals(): SavedMealSet {
    const meals: SavedMealRow[] = this.db
      .all('SELECT id, name, created_at_utc FROM saved_meal ORDER BY id DESC')
      .map((r) => ({
        id: int(r['id']),
        name: text(r['name']),
        createdAtUtc: text(r['created_at_utc']),
      }));
    return { meals, items: this.readItems('saved_meal_item', 'saved_meal_id') };
  }

  renameSavedMeal(id: number, name: string): void {
    this.db.run('UPDATE saved_meal SET name = ?, updated_at_hlc = ? WHERE id = ?', [
      name,
      this.clock.stamp(),
      id,
    ]);
  }

  deleteSavedMeal(id: number): void {
    this.db.transaction(() => {
      const stamp = this.clock.stamp();
      tombstoneRowsWhere(this.db, 'saved_meal_item', 'saved_meal_id = ?', [id], stamp);
      tombstoneRowsWhere(this.db, 'saved_meal', 'id = ?', [id], stamp);
      this.db.run('DELETE FROM saved_meal_item WHERE saved_meal_id = ?', [id]);
      this.db.run('DELETE FROM saved_meal WHERE id = ?', [id]);
    });
  }

  insertRecipe(
    name: string,
    servings: number,
    cookedWeightGrams: string | null,
    createdAtUtc: string,
    items: readonly EntryInsert[],
  ): number {
    return this.db.transaction(() => {
      this.db.run(
        `INSERT INTO recipe (uid, name, servings, cooked_weight_grams, created_at_utc, updated_at_hlc)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [this.clock.newUid(), name, servings, cookedWeightGrams, createdAtUtc, this.clock.stamp()],
      );
      const id = this.db.lastInsertRowid();
      this.insertItems('recipe_item', 'recipe_id', id, items);
      return id;
    });
  }

  readRecipes(): RecipeSet {
    const recipes: RecipeRow[] = this.db
      .all(
        'SELECT id, name, servings, cooked_weight_grams, created_at_utc FROM recipe ORDER BY id DESC',
      )
      .map((r) => ({
        id: int(r['id']),
        name: text(r['name']),
        servings: int(r['servings']),
        cookedWeightGrams: nullableText(r['cooked_weight_grams']),
        createdAtUtc: text(r['created_at_utc']),
      }));
    return { recipes, items: this.readItems('recipe_item', 'recipe_id') };
  }

  deleteRecipe(id: number): void {
    this.db.transaction(() => {
      const stamp = this.clock.stamp();
      tombstoneRowsWhere(this.db, 'recipe_item', 'recipe_id = ?', [id], stamp);
      tombstoneRowsWhere(this.db, 'recipe', 'id = ?', [id], stamp);
      this.db.run('DELETE FROM recipe_item WHERE recipe_id = ?', [id]);
      this.db.run('DELETE FROM recipe WHERE id = ?', [id]);
    });
  }

  private insertItems(
    table: SavedItemTable,
    parent: SavedItemParent,
    parentId: number,
    items: readonly EntryInsert[],
  ): void {
    items.forEach((e, position) =>
      insertItemRow(this.db, { table, parent, parentId, position, uid: this.clock.newUid() }, e),
    );
  }

  /** `table` and `parent` are fixed names from this file, never input. */
  private readItems(table: SavedItemTable, parent: SavedItemParent): SavedItemRow[] {
    return this.db
      .all(
        `SELECT id, ${parent} AS parent_id, source_ref, display_name, source, food_group,
                quantity_low, quantity_high, quantity_unit, quantity_display_label,
                quantity_grams, quantity_grams_estimated, nutrients_per_100g, food_extra
           FROM ${table} ORDER BY ${parent} ASC, position ASC, id ASC`,
      )
      .map((r) => ({
        id: int(r['id']),
        parentId: int(r['parent_id']),
        sourceRef: text(r['source_ref']),
        displayName: text(r['display_name']),
        source: text(r['source']),
        foodGroup: text(r['food_group']),
        quantityLow: text(r['quantity_low']),
        quantityHigh: text(r['quantity_high']),
        quantityUnit: text(r['quantity_unit']),
        quantityDisplayLabel: text(r['quantity_display_label']),
        quantityGrams: nullableText(r['quantity_grams']),
        quantityGramsEstimated: nullableInt(r['quantity_grams_estimated']),
        nutrientsPer100g: nullableText(r['nutrients_per_100g']),
        foodExtra: nullableText(r['food_extra']),
      }));
  }

  kvGet(key: string): string | null {
    const row = this.db.all('SELECT value FROM kv WHERE key = ?', [key])[0];
    return row ? text(row['value']) : null;
  }

  kvSet(key: string, value: string): void {
    this.db.run(
      `INSERT INTO kv (key, value, updated_at_hlc) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_hlc = excluded.updated_at_hlc`,
      [key, value, this.clock.stamp()],
    );
  }

  kvDelete(key: string): void {
    this.db.transaction(() => {
      if (isSyncedKvKey(key) && this.kvGet(key) !== null) {
        upsertTombstone(this.db, kvTombstoneUid(key), 'kv', this.clock.stamp());
      }
      this.db.run('DELETE FROM kv WHERE key = ?', [key]);
    });
  }

  readVault(): VaultSnapshot {
    return readVaultSnapshot(this.db);
  }

  readPlateUids(): readonly PlateUidRow[] {
    return this.db
      .all('SELECT id, uid FROM plate_log WHERE uid IS NOT NULL ORDER BY id DESC', [])
      .map((r) => ({ id: int(r['id']), uid: text(r['uid']) }));
  }

  applyVault(snapshot: VaultSnapshot): VaultApplyOutcome {
    return applyVaultSnapshot(this.db, this.clock, snapshot);
  }
}

function toEntry(r: SqlRow): EntryRow {
  return {
    id: int(r['entry_id']),
    plateLogId: int(r['plate_log_id']),
    sourceRef: text(r['source_ref']),
    displayName: text(r['display_name']),
    source: text(r['source']),
    foodGroup: text(r['food_group']),
    quantityLow: text(r['quantity_low']),
    quantityHigh: text(r['quantity_high']),
    quantityUnit: text(r['quantity_unit']),
    quantityDisplayLabel: text(r['quantity_display_label']),
    quantityGrams: nullableText(r['quantity_grams']),
    quantityGramsEstimated: nullableInt(r['quantity_grams_estimated']),
    nutrientsPer100g: nullableText(r['nutrients_per_100g']),
    foodExtra: nullableText(r['food_extra']),
  };
}
