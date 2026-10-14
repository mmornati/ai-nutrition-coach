import { exportReminderDue, systemClock, type Clock } from '@anc/core';
import type { ExportHistory } from './export-history';

/**
 * Wires the pure `exportReminderDue` rule to the stored dates. One quiet line with "Not now":
 * no badge, modal or push. Never throws; unknown dates read as "never".
 */
export interface ExportReminder {
  isDue(input: { readonly hasData: boolean }): Promise<boolean>;
  /** "Not now": remembered best effort (worst case the line shows again this session). */
  dismiss(): Promise<void>;
}

export function createExportReminder(deps: {
  readonly history: ExportHistory;
  readonly clock?: Clock;
}): ExportReminder {
  const clock = deps.clock ?? systemClock;
  return {
    async isDue({ hasData }) {
      if (!hasData) return false;
      const [lastExportAt, dismissedAt] = await Promise.all([
        deps.history.lastExportAt(),
        deps.history.reminderDismissedAt(),
      ]);
      return exportReminderDue({ now: clock(), hasData, lastExportAt, dismissedAt });
    },
    dismiss: () => deps.history.recordReminderDismissed(clock()),
  };
}
