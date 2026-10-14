/** The languages the app can speak. A new one is added here and in `catalogues.ts`. */
export type Locale = 'en' | 'fr';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'fr'];

export const DEFAULT_LOCALE: Locale = 'en';

/** The BCP 47 tag handed to `Intl` for each locale (en keeps the British formats used so far). */
const INTL_TAGS: Readonly<Record<Locale, string>> = { en: 'en-GB', fr: 'fr-FR' };

/**
 * Each language named in itself (an endonym), whatever the page language is. Not catalogue copy:
 * it must not be translated, and the picker tags each name with its own `lang`.
 */
export const LOCALE_ENDONYMS: Readonly<Record<Locale, string>> = { en: 'English', fr: 'Français' };

export const intlTag = (locale: Locale): string => INTL_TAGS[locale];

/** The supported locale a language tag asks for (any `fr*` primary subtag is French), else `null`. */
function fromTag(tag: unknown): Locale | null {
  if (typeof tag !== 'string') return null;
  const primary = tag.trim().toLowerCase().split(/[-_]/, 1)[0];
  return primary === 'fr' ? 'fr' : null;
}

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);

/**
 * Pick the locale to show. Order: an explicit preference (`null` or `'system'` means "follow the
 * device"), then the plaintext localStorage hint, then the browser's language list: the first
 * entry we support wins (`['de-DE', 'fr-FR']` is French), and the single `navigator.language` is
 * the fallback when the list is empty or missing. Pure and total: malformed tags, non-strings and
 * a missing list fall back to English.
 */
export function resolveLocale(
  pref: Locale | 'system' | null | undefined,
  hint: string | null | undefined,
  navigatorLanguages: readonly string[] | null | undefined,
  navigatorLanguage?: string | null,
): Locale {
  if (isLocale(pref)) return pref;
  if (isLocale(hint)) return hint;
  const list: readonly unknown[] = Array.isArray(navigatorLanguages) ? navigatorLanguages : [];
  for (const tag of list.length > 0 ? list : [navigatorLanguage]) {
    const found = fromTag(tag);
    if (found !== null) return found;
  }
  return DEFAULT_LOCALE;
}

/** Memoise a per-locale `Intl` object: built on first use, never again. */
export function perLocale<T>(make: (tag: string, locale: Locale) => T): (locale: Locale) => T {
  const cache = new Map<Locale, T>();
  return (locale) => {
    let value = cache.get(locale);
    if (value === undefined) {
      value = make(intlTag(locale), locale);
      cache.set(locale, value);
    }
    return value;
  };
}
