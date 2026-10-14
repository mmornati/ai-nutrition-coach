/**
 * The user's answers to the one-time privacy notices, kept in the ENCRYPTED key/value table. Port
 * of the earlier client.
 *
 *  - "About this app": shown once before the first Day Board, dismissed once.
 *  - "Barcodes are looked up on Open Food Facts": shown the first time a barcode is about to leave
 *    the device; the answer is `allowed` or `offlineOnly` (never look up online).
 *
 * They are not secrets, but they say how the person uses the app, so they live behind the same key
 * as the plates and go with "Erase all local data". While the store is locked a read answers the
 * default (not acknowledged, not asked) and a write throws `KeyValueStoreLocked`; callers treat a
 * failed write as "ask again next time", never as consent.
 */
import { KV_KEYS, type KeyValueStore } from '../storage/key-value-store';

/** What the person chose when told about Open Food Facts barcode lookups. */
export type OffLookupChoice =
  /** Not asked yet. Nothing is sent until they answer. */
  | 'unasked'
  /** OK: barcodes may be looked up online. */
  | 'allowed'
  /** "Don't look up online": the offline catalog only. */
  | 'offlineOnly';

export class PrivacyPrefs {
  constructor(
    private readonly kv: KeyValueStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Has the "About this app" notice been dismissed? Unreadable counts as not yet (shown again). */
  async aboutAcknowledged(): Promise<boolean> {
    try {
      const raw = await this.kv.read(KV_KEYS.privacyAboutAckAtUtc);
      return raw !== null && raw.length > 0;
    } catch {
      return false;
    }
  }

  async acknowledgeAbout(): Promise<void> {
    await this.kv.write(KV_KEYS.privacyAboutAckAtUtc, this.now().toISOString());
  }

  /** The stored answer; `unasked` when absent, unreadable or not one of the two known tokens. */
  async offLookupChoice(): Promise<OffLookupChoice> {
    try {
      switch (await this.kv.read(KV_KEYS.privacyOffLookup)) {
        case 'allowed':
          return 'allowed';
        case 'offlineOnly':
          return 'offlineOnly';
        default:
          return 'unasked';
      }
    } catch {
      return 'unasked';
    }
  }

  /** Persist the answer. `unasked` removes it (the privacy page lets the person change their mind). */
  async setOffLookupChoice(choice: OffLookupChoice): Promise<void> {
    if (choice === 'unasked') {
      await this.kv.delete(KV_KEYS.privacyOffLookup);
      return;
    }
    await this.kv.write(KV_KEYS.privacyOffLookup, choice);
  }

  toString(): string {
    return 'PrivacyPrefs()';
  }
}

/**
 * The gate the catalog asks right before a barcode would leave the device. `true` only when the
 * stored answer is `allowed`. A failure to read counts as `unasked`, so it stays closed.
 */
export function offLookupGate(
  prefs: Pick<PrivacyPrefs, 'offLookupChoice'>,
): () => Promise<boolean> {
  return async () => (await prefs.offLookupChoice()) === 'allowed';
}
