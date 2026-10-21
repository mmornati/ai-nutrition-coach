import {
  isExportFailure,
  systemClock,
  type Clock,
  type ExportFailure,
  type ExportFormat,
  type ExportScope,
  type Exporter,
  type Profile,
} from '@anc/core';
import { serializePlatesToCsv } from './csv-exporter';
import type { ExportDestination } from './export-destination';
import type { ExportHistory } from './export-history';
import { serializePlatesToJson, type SavedExport } from './json-exporter';

export type RunExportResult =
  | { readonly kind: 'exported'; readonly filename: string; readonly plateCount: number }
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'failed';
      readonly failure: ExportFailure | { readonly kind: 'deliveryFailed' };
    };

const MIME: Readonly<Record<ExportFormat, string>> = {
  csv: 'text/csv;charset=utf-8',
  json: 'application/json',
};

/** `YYYY-MM-DD-ai-nutrition-coach.csv|json`, the local date. */
export function exportFilename(format: ExportFormat, at: number): string {
  const d = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-ai-nutrition-coach.${format}`;
}

/**
 * Read (one bounded range read) -> serialize -> deliver -> remember the date. The date is
 * recorded best effort and only after a real delivery; a dismissed share sheet records nothing.
 */
export function createRunExport(deps: {
  readonly exporters: Readonly<Record<ExportFormat, Exporter>>;
  readonly destination: ExportDestination;
  readonly history: ExportHistory;
  readonly clock?: Clock;
  /** The optional profile, included in the JSON export only. Failure reads as none. */
  readonly readProfile?: () => Promise<Profile | undefined>;
  /** The saved meals and recipes, included in the JSON export only. Failure reads as none. */
  readonly readSaved?: () => Promise<SavedExport | undefined>;
}): (input: {
  readonly format: ExportFormat;
  readonly scope: ExportScope;
}) => Promise<RunExportResult> {
  const clock = deps.clock ?? systemClock;
  return async ({ format, scope }) => {
    const result = await deps.exporters[format].readPlates({ scope });
    if (isExportFailure(result)) return { kind: 'failed', failure: result };
    let profile: Profile | undefined;
    if (format === 'json' && deps.readProfile) {
      try {
        profile = await deps.readProfile();
      } catch {
        profile = undefined;
      }
    }
    let saved: SavedExport | undefined;
    if (format === 'json' && deps.readSaved) {
      try {
        saved = await deps.readSaved();
      } catch {
        saved = undefined;
      }
    }
    const text =
      format === 'csv'
        ? serializePlatesToCsv(result.plates)
        : serializePlatesToJson(result.plates, profile, saved);
    const now = clock();
    const filename = exportFilename(format, now);
    let outcome;
    try {
      outcome = await deps.destination.write({
        filename,
        mimeType: MIME[format],
        bytes: new TextEncoder().encode(text),
      });
    } catch {
      return { kind: 'failed', failure: { kind: 'deliveryFailed' } };
    }
    if (outcome === 'cancelled') return { kind: 'cancelled' };
    await deps.history.record(now);
    return { kind: 'exported', filename, plateCount: result.plates.length };
  };
}
