/** Keys in the encrypted store's key/value table used by the export feature. */
export const KV_KEYS = {
  exportLastAtUtc: 'export.lastAtUtc',
  exportReminderDismissedAtUtc: 'export.reminderDismissedAtUtc',
} as const;

/** Thrown by `set` while the store is locked: a lock must never look like "value gone". */
export class KeyValueStoreLocked extends Error {
  constructor() {
    super('The key/value store is locked.');
    this.name = 'KeyValueStoreLocked';
  }
}

/**
 * The small injected key/value surface. `get` answers `null` ("nothing known") while locked or
 * when absent; `set` rejects with `KeyValueStoreLocked` while locked.
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}
