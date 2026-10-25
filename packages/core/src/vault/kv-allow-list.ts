// Which `kv` keys may leave the device inside a vault snapshot. An ALLOW-list on purpose: a key
// added to the app later is device-only until someone decides, here, that it may travel (fail
// closed). The web app's `KV_KEYS` (apps/web/src/storage/key-value-store.ts) names the keys; a test
// there makes every one of them appear in exactly one of the two lists below.
//
// The rule behind the lists: a fact about the PERSON travels (language, profile, what they answered
// in the About notice); a fact about a DEVICE, a network destination or a secret does not. A
// consent to contact a destination (an AI endpoint, Open Food Facts) is given per device.

/** Keys whose value is a preference or an answer of the person, merged last-writer-wins per key. */
export const SYNCED_KV_KEYS: readonly string[] = Object.freeze([
  'export.lastAtUtc',
  'export.reminderDismissedAtUtc',
  'privacy.aboutAckAtUtc',
  'profile',
  'ui.locale',
  'ui.showNumbers',
]);

/**
 * The keys deliberately kept on the device, listed so the web test can tell "decided: stays" from
 * "forgotten". `ai.settings` (the rung and endpoint chosen on THIS device), the two AI consents and
 * the Open Food Facts answer (consent to a network destination, given per device) and the BYOK key
 * (a secret that spends money: never leaves; plan decision 4) are excluded; `sync.deviceId`
 * identifies the device itself; the `sync.*` connection keys (relay
 * handle, token, vault key, vault id, last version seen, dirty flag, baseline) are this device's own.
 */
export const DEVICE_ONLY_KV_KEYS: readonly string[] = Object.freeze([
  'ai.settings',
  'ai.coachingConsent',
  'ai.describeConsent',
  'ai.byokKey',
  'privacy.offLookup',
  'sync.deviceId',
  // This device's connection to a relay vault: the handle, the device token and the vault key (both
  // secrets), the vault id, the last version seen and the "not yet backed up" flag.
  'sync.handle',
  'sync.token',
  'sync.vaultKey',
  'sync.vaultId',
  'sync.lastSeenVersion',
  'sync.dirty',
  // Which plates the relay is known to hold: what the per-plate "synced" chip is derived from.
  'sync.baseline',
]);

const synced = new Set(SYNCED_KV_KEYS);

export const isSyncedKvKey = (key: string): boolean => synced.has(key);

/** Longest kv value a snapshot may carry (the profile is the largest, and is far smaller). */
export const MAX_KV_VALUE_LENGTH = 16_384;

const ISO_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** A UTC ISO-8601 instant at millisecond precision, the one format the store writes. */
export const isStoredInstant = (value: string): boolean =>
  ISO_MILLIS.test(value) && Number.isFinite(Date.parse(value));

/** A JSON object as text. */
export function isJsonObjectText(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/** Is `value` something the app writes under this synced key? Anything else is refused. */
export function isValidKvValue(key: string, value: string): boolean {
  if (value.length > MAX_KV_VALUE_LENGTH) return false;
  switch (key) {
    case 'ui.locale':
      return value === 'system' || value === 'en' || value === 'fr';
    case 'ui.showNumbers':
      return value === 'off';
    case 'profile':
      return isJsonObjectText(value);
    case 'export.lastAtUtc':
    case 'export.reminderDismissedAtUtc':
    case 'privacy.aboutAckAtUtc':
      return isStoredInstant(value);
    default:
      return false;
  }
}
