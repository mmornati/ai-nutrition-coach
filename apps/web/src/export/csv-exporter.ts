import {
  exportReady,
  exportScopeRange,
  type EncryptedStore,
  type ExportFormat,
  type ExportResult,
  type ExportScope,
  type Exporter,
  type PlateLog,
} from '@anc/core';

/**
 * The CSV header: one column per field, fixed order. Columns are only ever APPENDED (`food_group`
 * was the last addition) so a consumer that reads by position keeps working.
 */
export const CSV_HEADER =
  'id,logged_at_utc,entry_id,database_food_source,' +
  'database_food_ref,database_food_display_name,' +
  'quantity_low,quantity_high,quantity_unit,' +
  'quantity_display_label,food_group';

/** Longest text cell written, in characters (code points). */
export const MAX_CSV_FIELD_LENGTH = 1000;

// `=`, `+`, `-`, `@`, TAB, CR and the full-width forms U+FF1D / FF0B / FF0D / FF20.
const FORMULA_LEADERS = '=+-@\t\r＝＋－＠';

function looksLikeFormula(text: string): boolean {
  if (text.length === 0) return false;
  if (text[0] === '\t' || text[0] === '\r') return true;
  // First character that is not whitespace (space, NBSP, LF, ...).
  for (const ch of text) {
    if (/\s/u.test(ch)) continue;
    return FORMULA_LEADERS.includes(ch);
  }
  return false;
}

function quoteIfNeeded(raw: string): string {
  return /[,;"\t\n\r]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

/**
 * A TEXT cell: capped at 1000 characters, prefixed with `'` when a spreadsheet would read it as
 * a formula (also after leading whitespace and in the full-width forms), then quoted when it
 * contains `,` `;` `"` TAB LF or CR. Numbers must NOT go through here (`-2` would become `'-2`).
 */
function csvText(raw: string): string {
  let text = raw;
  const chars = Array.from(text);
  if (chars.length > MAX_CSV_FIELD_LENGTH) text = chars.slice(0, MAX_CSV_FIELD_LENGTH).join('');
  if (looksLikeFormula(text)) text = `'${text}`;
  return quoteIfNeeded(text);
}

/** A numeric cell, written as-is: negatives and decimals stay numbers. */
const csvNumber = (value: number): string => String(value);

/** One row per food entry; an empty list is a header-only file. UTF-8 text, LF line endings. */
export function serializePlatesToCsv(plates: readonly PlateLog[]): string {
  const lines: string[] = [CSV_HEADER];
  for (const plate of plates) {
    for (const entry of plate.entries) {
      lines.push(
        [
          String(plate.id),
          new Date(plate.loggedAtUtc).toISOString(),
          String(entry.id),
          csvText(entry.databaseFood.source),
          csvText(entry.databaseFood.sourceRef),
          csvText(entry.databaseFood.displayName),
          csvNumber(entry.quantity.low),
          csvNumber(entry.quantity.high),
          csvText(entry.quantity.unit),
          csvText(entry.quantity.displayLabel),
          csvText(entry.databaseFood.foodGroup),
        ].join(','),
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The one bounded range read both exporters share. The scope resolves to local calendar-day
 * boundaries and the store filters, so the export matches what is on screen without loading the
 * whole history. A locked store (no session key) is `storeClosed`; anything else is
 * `exportReadFailed`. Read-only, no network.
 */
export async function readPlatesForScope(
  store: EncryptedStore,
  scope: ExportScope,
): Promise<ExportResult> {
  const range = exportScopeRange(scope);
  const result = await store.readRange({
    from: range.from ?? undefined,
    to: range.to ?? undefined,
  });
  if (result.kind === 'platesRead') return exportReady(result.plates);
  return result.failure.reason === 'webSessionKey'
    ? { kind: 'storeClosed' }
    : { kind: 'exportReadFailed' };
}

/** An exporter that accepts exactly one format; the other is `exportFormatFailure`. */
export function createFormatExporter(store: EncryptedStore, accepts: ExportFormat): Exporter {
  const readPlates = (input: { readonly scope: ExportScope }): Promise<ExportResult> =>
    readPlatesForScope(store, input.scope);
  return {
    readPlates,
    async *streamPlates(input) {
      if (input.format !== accepts) {
        yield { kind: 'exportFormatFailure' };
        return;
      }
      yield await readPlates({ scope: input.scope });
    },
  };
}

export const createCsvExporter = (store: EncryptedStore): Exporter =>
  createFormatExporter(store, 'csv');
