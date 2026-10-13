import type { PlateLog } from '../entities/plate-log';

export type ExportFailure =
  | { readonly kind: 'storeClosed' }
  | { readonly kind: 'exportFormatFailure' }
  | { readonly kind: 'exportScopeFailure' }
  | { readonly kind: 'exportReadFailed' };

export type ExportResult =
  { readonly kind: 'exportReady'; readonly plates: readonly PlateLog[] } | ExportFailure;

export const exportReady = (plates: readonly PlateLog[]): ExportResult => ({
  kind: 'exportReady',
  plates,
});

export function isExportFailure(result: ExportResult): result is ExportFailure {
  return result.kind !== 'exportReady';
}
