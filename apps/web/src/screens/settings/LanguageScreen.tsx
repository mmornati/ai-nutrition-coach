import { useState } from 'react';
import { setCurrentLocale, useStrings } from '../../i18n';
import { localeFor, type LocalePreference } from '../../i18n/locale-prefs';
import { LOCALE_ENDONYMS, SUPPORTED_LOCALES } from '../../i18n/locale';
import { useSession } from '../../app/session';
import { ChoiceGroup, type Choice } from './ChoiceGroup';
import { Prose, SettingsPage } from './SettingsPage';

/**
 * Settings, Language. "Match my device" (the default) follows the browser; English and Français
 * pin a language. Picking applies at once and is kept in the encrypted store, with a plaintext
 * hint beside it for the screens before the unlock. Each language is named in itself and tagged
 * with `lang`, so a screen reader says it in its own voice whatever the page language is.
 */
export function LanguageScreen() {
  const c = useStrings().language;
  const { localePrefs } = useSession();
  // The session read the stored pick before any screen showed, so there is nothing to wait for
  // (and no late read that could overwrite a click).
  const [preference, setPreference] = useState<LocalePreference>(() => localePrefs.current());

  const choices: readonly Choice<LocalePreference>[] = [
    { value: 'system', label: c.matchDevice },
    ...SUPPORTED_LOCALES.map((locale) => ({
      value: locale,
      label: LOCALE_ENDONYMS[locale],
      lang: locale,
    })),
  ];

  const choose = (next: LocalePreference) => {
    setPreference(next);
    setCurrentLocale(localeFor(next));
    void localePrefs.write(next);
  };

  return (
    <SettingsPage title={c.title}>
      <div className="flex flex-col gap-4">
        <ChoiceGroup<LocalePreference>
          label={c.groupLabel}
          choices={choices}
          value={preference}
          onChange={choose}
        />
        <Prose>{c.explain}</Prose>
        <Prose>{c.note}</Prose>
      </div>
    </SettingsPage>
  );
}
