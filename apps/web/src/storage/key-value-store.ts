// The small encrypted key/value facts (`kv` table): AI settings, the BYOK key, the last-export
// time, the notice answers. Deliberately tiny.
//
// While the store is locked there is no open database: reads then answer `null` ("nothing known")
// and writes throw `KeyValueStoreLocked`, so a lock can never be mistaken for "the value is gone"
// and nothing is silently dropped. The app restarts its state scope on every lock and unlock, so
// values are read again after the unlock. Nothing here ever logs a value.

import { KeyValueStoreLocked } from './errors';
import type { StoreSource } from './store-source';

export { KeyValueStoreLocked };

/** The keys stored in `kv`. */
export const KV_KEYS = Object.freeze({
  /** `AiSettings` as JSON. */
  aiSettings: 'ai.settings',
  /**
   * `{ "host": "<destination>" }`: the person agreed to let an AI see their meals to write coach
   * notes and answer questions, for that destination only. Absent means no (the default). Not the
   * photo consent, which lives in `ai.settings`.
   */
  aiCoachingConsent: 'ai.coachingConsent',
  /**
   * `{ "host": "<destination>" }`: the person agreed to send what they type or say to describe a
   * meal (a short text, or a short voice recording) to an AI, for that destination only. Absent
   * means no (the default). Neither the photo consent nor the coaching consent.
   */
  aiDescribeConsent: 'ai.describeConsent',
  /** The BYOK API key. A secret: protected by the database key, never logged, never exported. */
  aiByokKey: 'ai.byokKey',
  /** UTC ISO-8601 time of the last successful export. */
  exportLastAtUtc: 'export.lastAtUtc',
  /** UTC ISO-8601 time the user dismissed the quiet export suggestion. */
  exportReminderDismissedAtUtc: 'export.reminderDismissedAtUtc',
  /** UTC ISO-8601 time the user dismissed the one-time "About this app" notice. */
  privacyAboutAckAtUtc: 'privacy.aboutAckAtUtc',
  /** `allowed` | `offlineOnly`: the answer to the one-time Open Food Facts notice. */
  privacyOffLookup: 'privacy.offLookup',
  /** `system` | `en` | `fr`: the interface language ("Match my device" when absent or `system`). */
  uiLocale: 'ui.locale',
  /** `off` when the person hid nutrition numbers; absent means shown (the default). */
  uiShowNumbers: 'ui.showNumbers',
  /** The optional `Profile` as JSON; absent means no profile. Included in the JSON export. */
  profile: 'profile',
} as const);

export interface KeyValueStore {
  /** The value for `key`, or `null` when absent (or the store is locked). */
  read(key: string): Promise<string | null>;
  /** Insert or replace. Throws `KeyValueStoreLocked` while locked. */
  write(key: string, value: string): Promise<void>;
  /** Remove `key` (no-op when absent). Throws `KeyValueStoreLocked` while locked. */
  delete(key: string): Promise<void>;
  /**
   * Whether a database is open right now. Absent on in-memory stand-ins, which are always open.
   * Lets a caller tell "nothing stored" from "locked, so nothing known".
   */
  isOpen?(): boolean;
}

/**
 * `kv` of the (open) encrypted database. The source is asked on every call, so the store hands
 * out its current database (or none while locked) without holding a stale handle.
 */
export class DatabaseKeyValueStore implements KeyValueStore {
  constructor(private readonly source: Pick<StoreSource, 'database'>) {}

  isOpen(): boolean {
    return this.source.database() !== null;
  }

  async read(key: string): Promise<string | null> {
    const db = this.source.database();
    if (!db) return null;
    return db.kvGet(key);
  }

  async write(key: string, value: string): Promise<void> {
    const db = this.source.database();
    if (!db) throw new KeyValueStoreLocked();
    await db.kvSet(key, value);
  }

  async delete(key: string): Promise<void> {
    const db = this.source.database();
    if (!db) throw new KeyValueStoreLocked();
    await db.kvDelete(key);
  }

  toString(): string {
    return 'DatabaseKeyValueStore()';
  }
}
