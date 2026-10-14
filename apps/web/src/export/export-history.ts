import type { EpochMs } from '@anc/core';
import { KV_KEYS, type KeyValueStore } from './key-value';

function parseInstant(raw: string | null): EpochMs | undefined {
  if (raw === null) return undefined;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * When did the person last export? Only ever a date in the encrypted store: no history of
 * exports, no counter, no streak. Reads never throw (locked or unreadable reads as unknown);
 * writes are best effort so failing to remember the date never turns a successful export into
 * an error.
 */
export interface ExportHistory {
  lastExportAt(): Promise<EpochMs | undefined>;
  record(at: EpochMs): Promise<void>;
  reminderDismissedAt(): Promise<EpochMs | undefined>;
  recordReminderDismissed(at: EpochMs): Promise<void>;
}

export function createExportHistory(kv: KeyValueStore): ExportHistory {
  const read = async (key: string): Promise<EpochMs | undefined> => {
    try {
      return parseInstant(await kv.get(key));
    } catch {
      return undefined;
    }
  };
  const write = async (key: string, at: EpochMs): Promise<void> => {
    try {
      await kv.set(key, new Date(at).toISOString());
    } catch {
      // The file was written; only the reminder date is lost.
    }
  };
  return {
    lastExportAt: () => read(KV_KEYS.exportLastAtUtc),
    record: (at) => write(KV_KEYS.exportLastAtUtc, at),
    reminderDismissedAt: () => read(KV_KEYS.exportReminderDismissedAtUtc),
    recordReminderDismissed: (at) => write(KV_KEYS.exportReminderDismissedAtUtc, at),
  };
}
