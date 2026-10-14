import { en, type Strings } from './en';
import { DEFAULT_LOCALE, type Locale } from './locale';

/**
 * The catalogue for each locale. `Partial` so a locale can be listed in `SUPPORTED_LOCALES`
 * before its copy exists (an unfinished one falls back to English); once `fr.ts` lands it is
 * typed `Strings` and added here, and `tsc` rejects a missing or extra key. Phase C then switches
 * this to `satisfies Record<Locale, Strings>` so a locale without a catalogue fails to compile.
 */
const catalogues: Partial<Record<Locale, Strings>> = { en };

export const catalogueFor = (locale: Locale): Strings =>
  catalogues[locale] ?? catalogues[DEFAULT_LOCALE] ?? en;
