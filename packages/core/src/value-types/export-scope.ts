import type { EpochMs } from '../common';
import { addCalendarDays, startOfLocalDay, startOfNextLocalDay } from './calendar-day';

export type ExportScope =
  | { readonly kind: 'visibleDay'; readonly day: EpochMs }
  | { readonly kind: 'week'; readonly start: EpochMs }
  | { readonly kind: 'allHistory' };

export const visibleDayScope = (day: EpochMs): ExportScope => ({ kind: 'visibleDay', day });
export const weekScope = (start: EpochMs): ExportScope => ({ kind: 'week', start });
export const ALL_HISTORY_SCOPE: ExportScope = Object.freeze({ kind: 'allHistory' });

/**
 * The half-open `[from, to)` range at local calendar-day boundaries. A `null` bound is open
 * (all history). The week is 7 calendar days, not 168 hours.
 */
export function exportScopeRange(scope: ExportScope): {
  readonly from: EpochMs | null;
  readonly to: EpochMs | null;
} {
  switch (scope.kind) {
    case 'visibleDay':
      return { from: startOfLocalDay(scope.day), to: startOfNextLocalDay(scope.day) };
    case 'week':
      return { from: startOfLocalDay(scope.start), to: addCalendarDays(scope.start, 7) };
    case 'allHistory':
      return { from: null, to: null };
  }
}
