// Reading the whole store as a vault snapshot, and applying one, over the SQLite database
// (docs/encrypted-sync-plan.md S0). The merge rules themselves are the pure functions in
// @anc/core; applying a snapshot applies the SAME rules row by row against what is stored, inside
// one transaction, so restoring into an empty store and applying a merged snapshot are one call.

import {
  canonicalizeSnapshot,
  canonicalText,
  isSyncedKvKey,
  kvTombstoneUid,
  KV_UID_PREFIX,
  newestHlc,
  pickStamped,
  SNAPSHOT_VERSION,
  snapshotBeyond,
  survivesTombstone,
  vaultConflict,
  ZERO_HLC,
  type TombstoneTable,
  type VaultCoachNote,
  type VaultEntry,
  type VaultPlate,
  type VaultRecipe,
  type VaultSavedMeal,
  type VaultSnapshot,
  type VaultTombstone,
} from '@anc/core';
import { SCHEMA_VERSION } from './constants';
import type { EntryInsert } from './ops';
import {
  insertEntryRow,
  insertItemRow,
  int,
  nullableInt,
  nullableText,
  text,
  upsertTombstone,
  type SavedItemParent,
  type SavedItemTable,
  type UidTable,
} from './sqlite-rows';
import type { SqlHandle, SqlRow, SqlValue } from './sql-handle';
import type { VaultApplyOutcome, VaultClock } from './vault-clock';
import {
  dismissalKeyFromVault,
  dismissalKeyToVault,
  fromVaultFood,
  toVaultFood,
} from './vault-mapping';

const FOOD_COLUMNS = `source_ref, display_name, source, food_group, quantity_low, quantity_high,
  quantity_unit, quantity_display_label, quantity_grams, quantity_grams_estimated,
  nutrients_per_100g, food_extra`;

function foodOf(r: SqlRow): EntryInsert {
  return {
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

function group<T>(rows: readonly T[], keyOf: (row: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = out.get(key);
    if (list) list.push(row);
    else out.set(key, [row]);
  }
  return out;
}

export function readVaultSnapshot(db: SqlHandle): VaultSnapshot {
  // One synchronous pass over a single connection: nothing can write in between, so the tables
  // below describe one moment.
  const entriesByPlate = group(
    db.all(`SELECT uid, plate_log_id, ${FOOD_COLUMNS} FROM food_entry ORDER BY id ASC`),
    (r) => int(r['plate_log_id']),
  );
  const interactionsByNote = group(
    db.all('SELECT uid, coach_note_id, kind, at FROM coach_interaction ORDER BY id ASC'),
    (r) => int(r['coach_note_id']),
  );
  const noteUidById = new Map<number, string>();
  const notesByPlate = group(
    db.all(
      'SELECT id, uid, plate_log_id, anchor, question_key, note_text, generated_at FROM coach_note ORDER BY id ASC',
    ),
    (r) => int(r['plate_log_id']),
  );

  const plates: VaultPlate[] = db
    .all('SELECT id, uid, logged_at_utc FROM plate_log ORDER BY id ASC')
    .map((p) => ({
      uid: text(p['uid']),
      loggedAtUtc: text(p['logged_at_utc']),
      entries: (entriesByPlate.get(int(p['id'])) ?? []).map((e) => ({
        uid: text(e['uid']),
        ...toVaultFood(foodOf(e)),
      })),
      notes: (notesByPlate.get(int(p['id'])) ?? []).map((n): VaultCoachNote => {
        noteUidById.set(int(n['id']), text(n['uid']));
        return {
          uid: text(n['uid']),
          anchor: text(n['anchor']),
          questionKey: text(n['question_key']),
          noteText: text(n['note_text']),
          generatedAt: text(n['generated_at']),
          interactions: (interactionsByNote.get(int(n['id'])) ?? []).map((i) => ({
            uid: text(i['uid']),
            kind: text(i['kind']),
            at: text(i['at']),
          })),
        };
      }),
    }));

  const dismissals = db
    .all('SELECT dismissal_key, dismissed_at_utc FROM coach_dismissal')
    .flatMap((d) => {
      const key = dismissalKeyToVault(text(d['dismissal_key']), noteUidById);
      return key === null ? [] : [{ key, dismissedAtUtc: text(d['dismissed_at_utc']) }];
    });

  const items = (table: SavedItemTable, parent: SavedItemParent) =>
    group(
      db.all(
        `SELECT uid, ${parent} AS parent_id, ${FOOD_COLUMNS} FROM ${table}
          ORDER BY ${parent} ASC, position ASC, id ASC`,
      ),
      (r) => int(r['parent_id']),
    );
  const mealItems = items('saved_meal_item', 'saved_meal_id');
  const recipeItems = items('recipe_item', 'recipe_id');
  const itemsOf = (rows: SqlRow[] | undefined): VaultEntry[] =>
    (rows ?? []).map((r) => ({ uid: text(r['uid']), ...toVaultFood(foodOf(r)) }));

  const savedMeals: VaultSavedMeal[] = db
    .all('SELECT id, uid, name, created_at_utc, updated_at_hlc FROM saved_meal ORDER BY id ASC')
    .map((m) => ({
      uid: text(m['uid']),
      name: text(m['name']),
      createdAtUtc: text(m['created_at_utc']),
      updatedAtHlc: nullableText(m['updated_at_hlc']) ?? ZERO_HLC,
      items: itemsOf(mealItems.get(int(m['id']))),
    }));
  const recipes: VaultRecipe[] = db
    .all(
      `SELECT id, uid, name, servings, cooked_weight_grams, created_at_utc, updated_at_hlc
         FROM recipe ORDER BY id ASC`,
    )
    .map((r) => ({
      uid: text(r['uid']),
      name: text(r['name']),
      servings: int(r['servings']),
      cookedWeightGrams: nullableText(r['cooked_weight_grams']),
      createdAtUtc: text(r['created_at_utc']),
      updatedAtHlc: nullableText(r['updated_at_hlc']) ?? ZERO_HLC,
      items: itemsOf(recipeItems.get(int(r['id']))),
    }));

  // Only keys on the allow-list; everything else (device id, AI settings, the BYOK key, a key a
  // future version adds) stays in the table and out of the snapshot.
  const kv = db
    .all('SELECT key, value, updated_at_hlc FROM kv')
    .filter((r) => isSyncedKvKey(text(r['key'])))
    .map((r) => ({
      key: text(r['key']),
      value: text(r['value']),
      updatedAtHlc: nullableText(r['updated_at_hlc']) ?? ZERO_HLC,
    }));

  const tombstones = db
    .all('SELECT uid, table_name, deleted_at_hlc FROM tombstone')
    .map((t): VaultTombstone => ({
      uid: text(t['uid']),
      table: text(t['table_name']) as TombstoneTable,
      deletedAtHlc: text(t['deleted_at_hlc']),
    }))
    // A deleted device-only key is not something to tell another device about either.
    .filter(
      (t) =>
        t.table !== 'kv' ||
        (t.uid.startsWith(KV_UID_PREFIX) && isSyncedKvKey(t.uid.slice(KV_UID_PREFIX.length))),
    );

  return canonicalizeSnapshot({
    snapshotVersion: SNAPSHOT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    plates,
    dismissals,
    savedMeals,
    recipes,
    kv,
    tombstones,
  });
}

// ---------------------------------------------------------------------------------------------

const idByUid = (db: SqlHandle, table: UidTable, uid: string): number | null => {
  const row = db.all(`SELECT id FROM ${table} WHERE uid = ?`, [uid])[0];
  return row ? int(row['id']) : null;
};

/** When this exact record (by table and uid) was deleted, or `null`. */
const tombstoneStamp = (db: SqlHandle, table: TombstoneTable, uid: string): string | null =>
  nullableText(
    db.all('SELECT deleted_at_hlc FROM tombstone WHERE table_name = ? AND uid = ?', [
      table,
      uid,
    ])[0]?.['deleted_at_hlc'],
  );

function removeNote(db: SqlHandle, noteId: number): void {
  db.run('DELETE FROM coach_interaction WHERE coach_note_id = ?', [noteId]);
  db.run('DELETE FROM coach_dismissal WHERE dismissal_key = ?', [`note:${noteId}`]);
  db.run('DELETE FROM coach_note WHERE id = ?', [noteId]);
}

/** A tombstone removes its record now (a template or kv entry only if it was not written after). */
function applyTombstone(db: SqlHandle, t: VaultTombstone): void {
  switch (t.table) {
    case 'plate_log': {
      const id = idByUid(db, 'plate_log', t.uid);
      if (id === null) return;
      for (const note of db.all('SELECT id FROM coach_note WHERE plate_log_id = ?', [id])) {
        removeNote(db, int(note['id']));
      }
      db.run('DELETE FROM food_entry WHERE plate_log_id = ?', [id]);
      db.run('DELETE FROM plate_log WHERE id = ?', [id]);
      return;
    }
    case 'food_entry':
      db.run('DELETE FROM food_entry WHERE uid = ?', [t.uid]);
      return;
    case 'coach_note': {
      const id = idByUid(db, 'coach_note', t.uid);
      if (id !== null) removeNote(db, id);
      return;
    }
    case 'coach_interaction':
      db.run('DELETE FROM coach_interaction WHERE uid = ?', [t.uid]);
      return;
    case 'saved_meal':
      removeTemplate(db, 'saved_meal', 'saved_meal_item', 'saved_meal_id', t);
      return;
    case 'recipe':
      removeTemplate(db, 'recipe', 'recipe_item', 'recipe_id', t);
      return;
    case 'kv': {
      if (!t.uid.startsWith(KV_UID_PREFIX)) return;
      const key = t.uid.slice(KV_UID_PREFIX.length);
      const row = db.all('SELECT updated_at_hlc FROM kv WHERE key = ?', [key])[0];
      const stamp = nullableText(row?.['updated_at_hlc']) ?? ZERO_HLC;
      if (row && !survivesTombstone(stamp, t.deletedAtHlc)) {
        db.run('DELETE FROM kv WHERE key = ?', [key]);
      }
      return;
    }
    case 'saved_meal_item':
    case 'recipe_item':
      return; // an item follows its record, which carries its own tombstone
  }
}

function removeTemplate(
  db: SqlHandle,
  table: 'saved_meal' | 'recipe',
  itemTable: SavedItemTable,
  parent: SavedItemParent,
  t: VaultTombstone,
): void {
  const row = db.all(`SELECT id, updated_at_hlc FROM ${table} WHERE uid = ?`, [t.uid])[0];
  if (!row) return;
  const stamp = nullableText(row['updated_at_hlc']) ?? ZERO_HLC;
  if (survivesTombstone(stamp, t.deletedAtHlc)) return;
  db.run(`DELETE FROM ${itemTable} WHERE ${parent} = ?`, [int(row['id'])]);
  db.run(`DELETE FROM ${table} WHERE id = ?`, [int(row['id'])]);
}

function applyPlate(db: SqlHandle, plate: VaultPlate): void {
  // A deleted plate never comes back, whatever the stamp: plates are insert-or-delete only.
  if (tombstoneStamp(db, 'plate_log', plate.uid) !== null) return;
  let plateId = idByUid(db, 'plate_log', plate.uid);
  if (plateId === null) {
    db.run('INSERT INTO plate_log (uid, logged_at_utc) VALUES (?, ?)', [
      plate.uid,
      plate.loggedAtUtc,
    ]);
    plateId = db.lastInsertRowid();
  }
  for (const entry of plate.entries) {
    if (
      tombstoneStamp(db, 'food_entry', entry.uid) !== null ||
      idByUid(db, 'food_entry', entry.uid) !== null
    ) {
      continue;
    }
    insertEntryRow(db, plateId, entry.uid, fromVaultFood(entry));
  }
  for (const note of plate.notes) {
    if (tombstoneStamp(db, 'coach_note', note.uid) !== null) continue;
    let noteId = idByUid(db, 'coach_note', note.uid);
    if (noteId === null) {
      db.run(
        `INSERT INTO coach_note (uid, plate_log_id, anchor, question_key, note_text, generated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [note.uid, plateId, note.anchor, note.questionKey, note.noteText, note.generatedAt],
      );
      noteId = db.lastInsertRowid();
    }
    for (const interaction of note.interactions) {
      if (
        tombstoneStamp(db, 'coach_interaction', interaction.uid) !== null ||
        idByUid(db, 'coach_interaction', interaction.uid) !== null
      ) {
        continue;
      }
      db.run('INSERT INTO coach_interaction (uid, coach_note_id, kind, at) VALUES (?, ?, ?, ?)', [
        interaction.uid,
        noteId,
        interaction.kind,
        interaction.at,
      ]);
    }
  }
}

/**
 * Is `incoming` the version to keep? The same decision the merge makes (`pickStamped`,
 * `survivesTombstone`), against the stored copy `stored` (as read before this apply) unless a
 * tombstone has just removed it.
 */
function incomingWins<T extends { readonly updatedAtHlc: string }>(
  incoming: T,
  stored: T | undefined,
  deletedAt: string | null,
): boolean {
  if (!survivesTombstone(incoming.updatedAtHlc, deletedAt)) return false;
  if (stored === undefined || !survivesTombstone(stored.updatedAtHlc, deletedAt)) return true;
  return canonicalText(pickStamped(stored, incoming)) !== canonicalText(stored);
}

interface TemplateTables {
  readonly table: 'saved_meal' | 'recipe';
  readonly itemTable: SavedItemTable;
  readonly parent: SavedItemParent;
}

/** Insert or replace a saved meal / recipe (its items with it) when `incomingWins`. */
function applyTemplate<T extends VaultSavedMeal | VaultRecipe>(
  db: SqlHandle,
  at: TemplateTables,
  record: T,
  stored: T | undefined,
  write: (existingId: number | null) => number,
): void {
  if (!incomingWins(record, stored, tombstoneStamp(db, at.table, record.uid))) return;
  const id = write(idByUid(db, at.table, record.uid));
  db.run(`DELETE FROM ${at.itemTable} WHERE ${at.parent} = ?`, [id]);
  record.items.forEach((item, position) =>
    insertItemRow(
      db,
      { table: at.itemTable, parent: at.parent, parentId: id, position, uid: item.uid },
      fromVaultFood(item),
    ),
  );
}

export function applyVaultSnapshot(
  db: SqlHandle,
  clock: VaultClock,
  snapshot: VaultSnapshot,
): VaultApplyOutcome {
  // Checked before anything is written: a stamp this far ahead would drag every later write after
  // it, and a uid that means something else here would move or delete the wrong row.
  if (snapshotBeyond(snapshot, clock.wallLimitMs())) return 'clockAhead';
  const before = readVaultSnapshot(db);
  if (vaultConflict(before, snapshot)) return 'conflict';
  const meals = new Map(before.savedMeals.map((m) => [m.uid, m] as const));
  const recipes = new Map(before.recipes.map((r) => [r.uid, r] as const));
  const entries = new Map(before.kv.map((e) => [e.key, e] as const));

  db.transaction(() => {
    for (const t of snapshot.tombstones) {
      upsertTombstone(db, t.uid, t.table, t.deletedAtHlc);
      applyTombstone(db, t);
    }
    for (const plate of snapshot.plates) applyPlate(db, plate);

    const noteIdByUid = new Map(
      db.all('SELECT id, uid FROM coach_note').map((r) => [text(r['uid']), int(r['id'])] as const),
    );
    for (const d of snapshot.dismissals) {
      const key = dismissalKeyFromVault(d.key, noteIdByUid);
      if (key === null) continue; // the marker of a note that is not here (it was deleted)
      db.run(
        `INSERT INTO coach_dismissal (dismissal_key, dismissed_at_utc) VALUES (?, ?)
         ON CONFLICT(dismissal_key) DO UPDATE SET dismissed_at_utc = excluded.dismissed_at_utc
           WHERE excluded.dismissed_at_utc > coach_dismissal.dismissed_at_utc`,
        [key, d.dismissedAtUtc],
      );
    }

    for (const meal of snapshot.savedMeals) {
      applyTemplate(
        db,
        { table: 'saved_meal', itemTable: 'saved_meal_item', parent: 'saved_meal_id' },
        meal,
        meals.get(meal.uid),
        (existingId) => {
          const bind: SqlValue[] = [meal.name, meal.createdAtUtc, meal.updatedAtHlc];
          if (existingId !== null) {
            db.run(
              'UPDATE saved_meal SET name = ?, created_at_utc = ?, updated_at_hlc = ? WHERE id = ?',
              [...bind, existingId],
            );
            return existingId;
          }
          db.run(
            'INSERT INTO saved_meal (uid, name, created_at_utc, updated_at_hlc) VALUES (?, ?, ?, ?)',
            [meal.uid, ...bind],
          );
          return db.lastInsertRowid();
        },
      );
    }
    for (const recipe of snapshot.recipes) {
      applyTemplate(
        db,
        { table: 'recipe', itemTable: 'recipe_item', parent: 'recipe_id' },
        recipe,
        recipes.get(recipe.uid),
        (existingId) => {
          const bind: SqlValue[] = [
            recipe.name,
            recipe.servings,
            recipe.cookedWeightGrams,
            recipe.createdAtUtc,
            recipe.updatedAtHlc,
          ];
          if (existingId !== null) {
            db.run(
              `UPDATE recipe SET name = ?, servings = ?, cooked_weight_grams = ?, created_at_utc = ?,
                 updated_at_hlc = ? WHERE id = ?`,
              [...bind, existingId],
            );
            return existingId;
          }
          db.run(
            `INSERT INTO recipe (uid, name, servings, cooked_weight_grams, created_at_utc, updated_at_hlc)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [recipe.uid, ...bind],
          );
          return db.lastInsertRowid();
        },
      );
    }
    for (const entry of snapshot.kv) {
      if (!isSyncedKvKey(entry.key)) continue; // fail closed, whatever the caller validated
      const deletedAt = tombstoneStamp(db, 'kv', kvTombstoneUid(entry.key));
      if (!incomingWins(entry, entries.get(entry.key), deletedAt)) continue;
      db.run(
        `INSERT INTO kv (key, value, updated_at_hlc) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_hlc = excluded.updated_at_hlc`,
        [entry.key, entry.value, entry.updatedAtHlc],
      );
    }
  });
  // The stamps that arrived are now part of this store's history: later writes sort after them.
  clock.observe(newestHlc(snapshot));
  return 'applied';
}
