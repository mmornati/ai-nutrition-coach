// The production sink for rows the store skipped because they could not be mapped (a bad
// timestamp, an invalid quantity). Content-free by design: only the table-local row id and a short
// fixed reason ever reach it, never a stored value, so it is safe to print in a development build
// and to count.

let skipped = 0;

/** How many corrupt rows have been skipped since the page loaded. */
export function corruptRowsSkipped(): number {
  return skipped;
}

/** The `CorruptRowReporter` the production mapping uses. */
export function reportCorruptRow(rowId: number, reason: string): void {
  skipped++;
  if (import.meta.env.DEV) {
    // log-hygiene: content-free (a row id and a fixed reason, never values)
    console.debug(`ai-nutrition-coach: skipped unreadable row #${rowId} (${reason})`);
  }
}

/** Reports a skipped row. Receives the row id and a fixed reason; never the row's values. */
export type CorruptRowReporter = (rowId: number, reason: string) => void;

/** Reset the counter (tests). */
export function resetCorruptRowCounter(): void {
  skipped = 0;
}
