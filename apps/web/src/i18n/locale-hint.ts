/**
 * The plaintext language hint in localStorage. The language preference lives in the encrypted
 * store, which cannot be read before the unlock, so the gate screens (passphrase, unlock, lost
 * store) read this copy instead. It reveals only the chosen language, is written whenever the
 * preference changes, is absent for "Match my device", and goes with "Erase all local data".
 * Every access is guarded: a browser that refuses storage just has no hint.
 */
import { LOCALE_HINT_KEY } from '../storage/constants';
import { isLocale, type Locale } from './locale';

export interface LocaleHint {
  /** The stored locale, or `null` when absent, unsupported or unreadable. */
  read(): Locale | null;
  /** Store `locale`; `null` removes the hint. Never throws. */
  write(locale: Locale | null): void;
}

export function browserLocaleHint(): LocaleHint {
  return {
    read() {
      try {
        const value = window.localStorage.getItem(LOCALE_HINT_KEY);
        return isLocale(value) ? value : null;
      } catch {
        return null;
      }
    },
    write(locale) {
      try {
        if (locale === null) window.localStorage.removeItem(LOCALE_HINT_KEY);
        else window.localStorage.setItem(LOCALE_HINT_KEY, locale);
      } catch {
        // Storage refused: the next visit follows the browser until the preference is read.
      }
    },
  };
}
