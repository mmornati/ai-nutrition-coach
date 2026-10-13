import type { ExportResult } from '../results/export';
import type { ExportFormat } from '../value-types/export-format';
import type { ExportScope } from '../value-types/export-scope';

export interface Exporter {
  streamPlates(input: {
    readonly format: ExportFormat;
    readonly scope: ExportScope;
  }): AsyncIterable<ExportResult>;
  readPlates(input: { readonly scope: ExportScope }): Promise<ExportResult>;
}
