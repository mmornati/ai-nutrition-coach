import type { EpochMs } from '@anc/core';
import { currentLocale } from '../../i18n';
import { perLocale, type Locale } from '../../i18n/locale';

const lastExportFormat = perLocale(
  (tag) => new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric' }),
);

/** "16 August 2026": the local date of the last export. */
export const formatLastExport = (at: EpochMs, locale: Locale = currentLocale()): string =>
  lastExportFormat(locale).format(new Date(at));
