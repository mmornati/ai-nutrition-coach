import {
  exportScopeRange,
  isExportFailure,
  localDayText,
  systemClock,
  type Clock,
  type ExportFailure,
  type ExportFormat,
  type ExportScope,
  type Exporter,
  type BodyMeasurement,
  type Profile,
} from '@anc/core';
import { serializeMeasurementsToCsv, serializePlatesToCsv } from './csv-exporter';
import type { ExportDestination } from './export-destination';
import type { ExportHistory } from './export-history';
import { serializePlatesToJson, type SavedExport } from './json-exporter';

export type RunExportResult =
  | { readonly kind: 'exported'; readonly filename: string; readonly plateCount: number }
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'failed';
      readonly failure:
        ExportFailure | { readonly kind: 'deliveryFailed' } | { readonly kind: 'savedUnavailable' };
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
  /**
   * The saved meals and recipes, included in the JSON export only. A failed read (a rejection)
   * fails the export with a calm message: an export that quietly left them out would look whole.
   */
  readonly readSaved?: () => Promise<SavedExport | undefined>;
  /**
   * The person's dated body measurements (docs/adr/0008): in the JSON export as `bodyMeasurements`,
   * and as a second, separate CSV file next to the plates CSV (one row per measurement), only when
   * there are some in the scope. A failed read fails the export, like the saved meals.
   */
  readonly readMeasurements?: () => Promise<readonly BodyMeasurement[] | undefined>;
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
        return { kind: 'failed', failure: { kind: 'savedUnavailable' } };
      }
    }
    let measurements: readonly BodyMeasurement[] = [];
    if (deps.readMeasurements) {
      try {
        // By the stored LOCAL day (`yyyy-MM-dd`), the same calendar days the scope names, not by
        // the UTC instant: a weigh-in entered for another day, or near midnight, stays with its day.
        const range = exportScopeRange(scope);
        const fromDay = range.from === null ? null : localDayText(range.from);
        const toDay = range.to === null ? null : localDayText(range.to);
        measurements = ((await deps.readMeasurements()) ?? []).filter(
          (m) => (fromDay === null || m.day >= fromDay) && (toDay === null || m.day < toDay),
        );
      } catch {
        return { kind: 'failed', failure: { kind: 'savedUnavailable' } };
      }
    }
    const text =
      format === 'csv'
        ? serializePlatesToCsv(result.plates)
        : serializePlatesToJson(result.plates, profile, saved, measurements);
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
    if (format === 'csv' && measurements.length > 0) {
      // The body measurements are their own file: the plates CSV keeps one row per food entry.
      try {
        await deps.destination.write({
          filename: exportFilename('csv', now).replace(/\.csv$/, '-body.csv'),
          mimeType: MIME.csv,
          bytes: new TextEncoder().encode(serializeMeasurementsToCsv(measurements)),
        });
      } catch {
        return { kind: 'failed', failure: { kind: 'deliveryFailed' } };
      }
    }
    await deps.history.record(now);
    return { kind: 'exported', filename, plateCount: result.plates.length };
  };
}
