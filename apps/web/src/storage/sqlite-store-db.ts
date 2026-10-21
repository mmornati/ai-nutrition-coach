// `StoreDbOps` over the (already keyed) SQLite database. Runs inside the worker. All SQL for the
// store is here.

import type {
  EntryInsert,
  EntryRow,
  InsertedPlate,
  NoteInsert,
  NoteRow,
  PlateRow,
  PlateRowSet,
  StoreDbOps,
} from './ops';
import type { SqlHandle, SqlRow, SqlValue } from './sql-handle';

const text = (value: SqlValue | undefined): string =>
  value === null || value === undefined ? '' : String(value);
const nullableText = (value: SqlValue | undefined): string | null =>
  value === null || value === undefined ? null : String(value);
const nullableInt = (value: SqlValue | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const int = (value: SqlValue | undefined): number => Number(value ?? 0);

export class SqliteStoreDb implements StoreDbOps {
  constructor(private readonly db: SqlHandle) {}

  insertPlate(loggedAtUtc: string, entries: readonly EntryInsert[]): InsertedPlate {
    return this.db.transaction(() => {
      this.db.run('INSERT INTO plate_log (logged_at_utc) VALUES (?)', [loggedAtUtc]);
      const plateId = this.db.lastInsertRowid();
      const entryIds: number[] = [];
      for (const e of entries) {
        this.db.run(
          `INSERT INTO food_entry (plate_log_id, source_ref, display_name, source, food_group,
             quantity_low, quantity_high, quantity_unit, quantity_display_label,
             quantity_grams, quantity_grams_estimated, nutrients_per_100g, food_extra)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
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
        entryIds.push(this.db.lastInsertRowid());
      }
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
    // Set-based sub-selects (nothing is read into JS): the note ids and their dismissal keys.
    this.db.transaction(() => {
      this.deleteNotesInTransaction(plateLogId);
      this.db.run('DELETE FROM food_entry WHERE plate_log_id = ?', [plateLogId]);
      this.db.run('DELETE FROM plate_log WHERE id = ?', [plateLogId]);
    });
  }

  insertNote(note: NoteInsert): number {
    this.db.run(
      `INSERT INTO coach_note (plate_log_id, anchor, question_key, note_text, generated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [note.plateLogId, note.anchor, note.questionKey, note.noteText, note.generatedAt],
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
    this.db.run('INSERT INTO coach_interaction (coach_note_id, kind, at) VALUES (?, ?, ?)', [
      coachNoteId,
      kind,
      atUtc,
    ]);
    return this.db.lastInsertRowid();
  }

  deleteNotesForPlate(plateLogId: number): void {
    this.db.transaction(() => this.deleteNotesInTransaction(plateLogId));
  }

  private deleteNotesInTransaction(plateLogId: number): void {
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

  kvGet(key: string): string | null {
    const row = this.db.all('SELECT value FROM kv WHERE key = ?', [key])[0];
    return row ? text(row['value']) : null;
  }

  kvSet(key: string, value: string): void {
    this.db.run(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }

  kvDelete(key: string): void {
    this.db.run('DELETE FROM kv WHERE key = ?', [key]);
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
