/**
 * The interface language the person picked, kept in the ENCRYPTED key/value table
 * (`KV_KEYS.uiLocale`) so it travels with the rest of their data and goes with "Erase all local
 * data". `system` ("Match my device") is the default and means "follow the browser".
 *
 * Reading tells "absent" from "unknown": an absent row (or an unsupported value) on an open store
 * is `system`, but an unreadable or locked store is unknown (`null`), and an unknown answer changes
 * nothing, so a lock can never wipe the hint or flip the language. Reads never throw. A write
 * mirrors the choice to the plaintext hint first (see `locale-hint.ts`), then to the store; if the
 * store write fails the choice is kept in memory for this session and the error is swallowed, so
 * picking a language can never crash or be silently undone while the app is open.
 */
import { KV_KEYS, type KeyValueStore } from '../storage/key-value-store';
import { browserLocaleHint, type LocaleHint } from './locale-hint';
import { setCurrentLocale } from './index';
import { isLocale, resolveLocale, type Locale } from './locale';

export type LocalePreference = Locale | 'system';

export class LocalePrefs {
  private held: LocalePreference | null = null;
  private last: LocalePreference | null = null;

  constructor(
    private readonly kv: KeyValueStore,
    private readonly hint: LocaleHint = browserLocaleHint(),
  ) {}

  /** The stored preference, or `null` when it cannot be known (unreadable, or no open database). */
  async readStored(): Promise<LocalePreference | null> {
    if (this.held !== null) return this.held;
    try {
      if (this.kv.isOpen && !this.kv.isOpen()) return null;
      const raw = await this.kv.read(KV_KEYS.uiLocale);
      // The store may have been locked while the read was in flight: that answer is not "absent".
      if (this.kv.isOpen && !this.kv.isOpen()) return null;
      const preference = isLocale(raw) ? raw : 'system';
      this.last = preference;
      return preference;
    } catch {
      return null;
    }
  }

  /** The last preference read or written (synchronous, for a first paint); `system` before any. */
  current(): LocalePreference {
    return this.held ?? this.last ?? 'system';
  }

  async write(preference: LocalePreference): Promise<void> {
    this.last = preference;
    this.syncHint(preference);
    try {
      if (preference === 'system') await this.kv.delete(KV_KEYS.uiLocale);
      else await this.kv.write(KV_KEYS.uiLocale, preference);
      this.held = null;
    } catch {
      this.held = preference;
    }
  }

  /** Make the hint agree with the preference (absent for `system`). */
  syncHint(preference: LocalePreference): void {
    const wanted = preference === 'system' ? null : preference;
    if (this.hint.read() !== wanted) this.hint.write(wanted);
  }

  toString(): string {
    return 'LocalePrefs()';
  }
}

/**
 * The locale a preference asks for: the pick itself, or the browser's language for `system`
 * (the hint is ignored here: it only stands in for the preference before the unlock).
 */
export const localeFor = (preference: LocalePreference): Locale =>
  resolveLocale(preference, null, navigator.languages, navigator.language);

/**
 * After the unlock: read the stored preference (when it can be known), show it, and bring the plaintext hint into line
 * with it (a hint left behind by an earlier write that failed, or one that disagrees).
 */
export async function applyStoredLocale(prefs: LocalePrefs): Promise<void> {
  applyLocalePreference(prefs, await prefs.readStored());
}

/** Apply an already-read preference. `null` (unknown) changes nothing: no hint, no locale. */
export function applyLocalePreference(
  prefs: LocalePrefs,
  preference: LocalePreference | null,
): void {
  if (preference === null) return;
  prefs.syncHint(preference);
  setCurrentLocale(localeFor(preference));
}
