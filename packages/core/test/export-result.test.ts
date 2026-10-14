import { describe, expect, it } from 'vitest';
import { exportReady, isExportFailure, type ExportResult } from '../src/index';

describe('ExportResult', () => {
  it('exportReady carries a plate list', () => {
    const ready = exportReady([]);
    expect(ready.kind === 'exportReady' && ready.plates).toEqual([]);
    expect(isExportFailure(ready)).toBe(false);
  });

  it.each([
    'storeClosed',
    'exportFormatFailure',
    'exportScopeFailure',
    'exportReadFailed',
  ] as const)('%s is a typed failure', (kind) => {
    expect(isExportFailure({ kind })).toBe(true);
  });

  it('the discriminated envelope is exhaustive', () => {
    const describeResult = (r: ExportResult): string => {
      switch (r.kind) {
        case 'exportReady':
          return 'ready';
        case 'storeClosed':
        case 'exportFormatFailure':
        case 'exportScopeFailure':
        case 'exportReadFailed':
          return 'failure';
      }
    };
    expect(describeResult({ kind: 'storeClosed' })).toBe('failure');
    expect(describeResult(exportReady([]))).toBe('ready');
  });
});
