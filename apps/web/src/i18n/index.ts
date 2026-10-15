import { createContext, useCallback, useContext, useState } from 'react';
import type { Strings } from './en';
import { catalogueFor } from './catalogues';
import { DEFAULT_LOCALE, perLocale, type Locale } from './locale';

export type { Strings };

/** Replace `{name}` placeholders. A missing variable is left visible rather than hidden. */
export function fill(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = vars[key];
    return value === undefined ? whole : String(value);
  });
}

let current: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

/** The locale non-hook code reads. The module is the source of truth; the provider mirrors it. */
export const currentLocale = (): Locale => current;

/** Subscribe to locale changes (`useSyncExternalStore` shape). Returns the unsubscribe. */
export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Switch the locale and notify subscribers (a no-op if unchanged). Screens call `setLocale` from
 * `useLocale()`; this is for non-React callers too, e.g. the unlock flow once the stored
 * preference is read.
 */
export function setCurrentLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  for (const listener of [...listeners]) listener();
}

/** Copy worded at display time: hold one of these in state instead of a rendered string. */
export type Message = (all: Strings) => string | null;

/**
 * A line of feedback held in state that follows the locale: set it with a `Message` (not a string,
 * which would stay in the language it was written in) and read the current text back.
 */
export function useMessage(): readonly [string | null, (next: Message | null) => void] {
  const all = useStrings();
  const [held, setHeld] = useState<{ readonly of: Message } | null>(null);
  const set = useCallback(
    (next: Message | null) => setHeld(next === null ? null : { of: next }),
    [],
  );
  return [held === null ? null : held.of(all), set];
}

export interface LocaleContextValue {
  readonly locale: Locale;
  /** The seam the stored preference will drive; a no-op outside a provider. */
  readonly setLocale: (locale: Locale) => void;
}

export const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
});

export const useLocale = (): LocaleContextValue => useContext(LocaleContext);

export function useStrings(): Strings {
  return catalogueFor(useLocale().locale);
}

/** Non-hook access for code outside React (tests, formatters). Follows the current locale. */
export function strings(): Strings {
  return catalogueFor(current);
}

export interface PluralForms {
  readonly zero?: string;
  readonly one: string;
  readonly other: string;
}

const pluralRules = perLocale((tag) => new Intl.PluralRules(tag));

/** Pick the form for `count` (an explicit `zero` wins at 0), then fill `{count}`. */
export function plural(forms: PluralForms, count: number, locale: Locale = current): string {
  const template =
    count === 0 && forms.zero !== undefined
      ? forms.zero
      : forms[pluralRules(locale).select(count) === 'one' ? 'one' : 'other'];
  return fill(template, { count });
}

const listFormat = perLocale(
  (tag) => new Intl.ListFormat(tag, { style: 'long', type: 'conjunction' }),
);

/** "a", "a and b", "a, b and c". */
export const joinNames = (names: readonly string[], locale: Locale = current): string =>
  listFormat(locale).format(names);

const unitFormat = perLocale((tag) => new Intl.ListFormat(tag, { style: 'short', type: 'unit' }));

/** "a", "a, b", "a, b, c": a plain run of items with no conjunction. */
export const joinPlain = (names: readonly string[], locale: Locale = current): string =>
  unitFormat(locale).format(names);

export const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
