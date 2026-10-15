import { en, type Strings } from './en';
import { fr } from './fr';
import type { Locale } from './locale';

/**
 * The catalogue for each locale. `satisfies Record<Locale, Strings>`: a locale listed in `Locale`
 * without a catalogue fails to compile, and each catalogue is typed `Strings`, so a missing or
 * extra key does too. There is no fallback chain.
 */
const catalogues = { en, fr } satisfies Record<Locale, Strings>;

export const catalogueFor = (locale: Locale): Strings => catalogues[locale];
