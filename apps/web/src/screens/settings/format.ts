import type { EpochMs } from '@anc/core';

const lastExportFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** "16 August 2026": the local date of the last export. */
export const formatLastExport = (at: EpochMs): string => lastExportFormat.format(new Date(at));
