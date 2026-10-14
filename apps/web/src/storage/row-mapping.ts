// Raw rows -> domain values, on the main thread. A corrupt stored row never poisons a read or a
// stream: a plate with an unparseable timestamp and an entry with a non-finite or inverted
// quantity are skipped and reported through the (content-free) reporter.

import {
  foodGroupFromStored,
  frozenList,
  isValidRange,
  plateLog,
  SOURCE_CATALOGS,
  type CoachAnchor,
  type CoachNote,
  type EpochMs,
  type FoodEntry,
  type PlateLog,
  type SourceCatalog,
  COACH_ANCHORS,
} from '@anc/core';
import type { CorruptRowReporter } from './corrupt-row-log';
import type { EntryRow, NoteRow, PlateRowSet } from './ops';

const ISO_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** UTC ISO-8601 with millisecond precision: fixed width, so text order is instant order. */
export function toStoredInstant(moment: EpochMs): string {
  return new Date(moment).toISOString();
}

/** Strict inverse of `toStoredInstant`; `null` for anything else. */
export function parseStoredInstant(raw: string): EpochMs | null {
  if (!ISO_MILLIS.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** `null` for anything that is not a finite number (NaN, Infinity, garbage, blank). */
function parseFinite(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseSource(raw: string): SourceCatalog {
  return SOURCE_CATALOGS.find((s) => s === raw) ?? 'manual';
}

function toEntry(row: EntryRow, report: CorruptRowReporter): FoodEntry | null {
  const low = parseFinite(row.quantityLow);
  const high = parseFinite(row.quantityHigh);
  if (low === null || high === null || !isValidRange(low, high)) {
    report(row.id, 'entry: invalid quantity');
    return null;
  }
  return {
    id: row.id,
    plateLogId: row.plateLogId,
    databaseFood: {
      sourceRef: row.sourceRef,
      displayName: row.displayName,
      source: parseSource(row.source),
      foodGroup: foodGroupFromStored(row.foodGroup),
    },
    quantity: { low, high, unit: row.quantityUnit, displayLabel: row.quantityDisplayLabel },
  };
}

export function mapPlateRows(set: PlateRowSet, report: CorruptRowReporter): readonly PlateLog[] {
  const byPlate = new Map<number, FoodEntry[]>();
  for (const row of set.entries) {
    const entry = toEntry(row, report);
    if (!entry) continue;
    const bucket = byPlate.get(row.plateLogId);
    if (bucket) bucket.push(entry);
    else byPlate.set(row.plateLogId, [entry]);
  }
  const plates: PlateLog[] = [];
  for (const row of set.plates) {
    const loggedAtUtc = parseStoredInstant(row.loggedAtUtc);
    if (loggedAtUtc === null) {
      report(row.id, 'plate: unparseable timestamp');
      continue;
    }
    plates.push(plateLog({ id: row.id, loggedAtUtc, entries: byPlate.get(row.id) ?? [] }));
  }
  return frozenList(plates);
}

function parseAnchor(raw: string): CoachAnchor {
  // A future anchor the v1 store does not know about must not crash the read path.
  return COACH_ANCHORS.find((a) => a === raw) ?? 'postResolve';
}

/** Notes with an unparseable timestamp are skipped (and reported), never thrown. */
export function mapNoteRows(
  rows: readonly NoteRow[],
  report: CorruptRowReporter,
): readonly CoachNote[] {
  const notes: CoachNote[] = [];
  for (const row of rows) {
    const generatedAt = parseStoredInstant(row.generatedAt);
    if (generatedAt === null) {
      report(row.id, 'note: unparseable timestamp');
      continue;
    }
    notes.push(
      Object.freeze({
        id: row.id,
        plateLogId: row.plateLogId,
        anchor: parseAnchor(row.anchor),
        questionKey: row.questionKey,
        text: row.noteText,
        generatedAt,
      }),
    );
  }
  return frozenList(notes);
}
