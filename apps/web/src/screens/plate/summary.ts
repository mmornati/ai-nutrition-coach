import type { PlateLog } from '@anc/core';
import { foodName } from '../../catalog';
import { currentLocale } from '../../i18n';
import type { Locale } from '../../i18n/locale';

/**
 * "Rice, salmon": the plate's foods in the order they were logged, seed foods named in `locale`
 * (the current one by default), everything else as it was logged.
 */
export const plateSummary = (plate: PlateLog, locale: Locale = currentLocale()): string =>
  plate.entries.map((e) => foodName(e.databaseFood, locale)).join(', ');
