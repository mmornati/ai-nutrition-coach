import type { EpochMs } from '../common';

/** Elapsed time (not calendar days) after which an export reminder may speak. */
export const EXPORT_REMINDER_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Suggest an export only if data exists and the last export is older than 14 days (or never).
 * A dismissal is respected for 14 days, unless it predates the last export.
 */
export function exportReminderDue(input: {
  readonly now: EpochMs;
  readonly hasData: boolean;
  readonly lastExportAt?: EpochMs | undefined;
  readonly dismissedAt?: EpochMs | undefined;
}): boolean {
  const { now, hasData, lastExportAt, dismissedAt } = input;
  if (!hasData) return false;
  const stale = lastExportAt === undefined || now - lastExportAt > EXPORT_REMINDER_AFTER_MS;
  if (!stale) return false;
  if (
    dismissedAt !== undefined &&
    now - dismissedAt <= EXPORT_REMINDER_AFTER_MS &&
    (lastExportAt === undefined || dismissedAt > lastExportAt)
  ) {
    return false;
  }
  return true;
}
