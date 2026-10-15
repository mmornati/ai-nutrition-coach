import { useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LocaleContext, currentLocale, setCurrentLocale, subscribeLocale } from './index';
import type { Locale } from './locale';

export interface LocaleProviderProps {
  /** Seed only: read once, on first render. Later changes go through `setLocale`. */
  readonly initial: Locale;
  readonly children: ReactNode;
}

/**
 * Exposes the locale on screen. The module in `./index` owns it (so `strings()` and the formatters
 * are right for non-React callers too); this subscribes with `useSyncExternalStore` and mirrors it
 * to `<html lang>` for screen readers. `setLocale` is the seam the stored preference drives.
 */
export function LocaleProvider({ initial, children }: LocaleProviderProps): ReactNode {
  // Seeded once, before the first read below, so the very first render already has the locale.
  useState(() => {
    setCurrentLocale(initial);
    return null;
  });
  const locale = useSyncExternalStore(subscribeLocale, currentLocale, currentLocale);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale: setCurrentLocale }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
