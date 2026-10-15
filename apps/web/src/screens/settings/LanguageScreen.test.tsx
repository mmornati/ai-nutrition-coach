// Settings, Language: "Match my device" first and by default, English and Français named in
// themselves with `lang`, a pick applies at once and is kept (encrypted store + plaintext hint).
import { cleanup, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderInSession, renderUnlockedApp, unlockedBundle } from '../../app/testing';
import { currentLocale, setCurrentLocale } from '../../i18n';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { DEFAULT_LOCALE } from '../../i18n/locale';
import { KV_KEYS } from '../../storage';
import { LOCALE_HINT_KEY } from '../../storage/constants';
import { LanguageScreen } from './LanguageScreen';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.location.hash = '';
  window.localStorage.clear();
  setCurrentLocale(DEFAULT_LOCALE);
  document.documentElement.lang = '';
});

const withProvider = ({ children }: { children: ReactNode }) => (
  <LocaleProvider initial={DEFAULT_LOCALE}>{children}</LocaleProvider>
);

async function openLanguage(seed?: 'en' | 'fr') {
  const bundle = await unlockedBundle();
  if (seed) await bundle.kv.write(KV_KEYS.uiLocale, seed);
  window.location.hash = '#/settings/language';
  await renderUnlockedApp(bundle);
  await screen.findByRole('heading', { level: 1, name: 'Language' });
  return bundle;
}

describe('LanguageScreen', () => {
  it('offers Match my device (first, chosen by default), English and Français', async () => {
    await openLanguage();
    const group = screen.getByRole('group', { name: 'App language' });
    const radios = [...group.querySelectorAll('input[type="radio"]')];
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['system', 'en', 'fr']);
    expect(screen.getByRole('radio', { name: 'Match my device' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeChecked();
  });

  it('names each language in itself, tagged with its lang', async () => {
    await openLanguage();
    expect(screen.getByText('English')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Français')).toHaveAttribute('lang', 'fr');
    expect(screen.getByText('Match my device')).not.toHaveAttribute('lang');
  });

  it('shows the stored pick', async () => {
    await openLanguage('fr');
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Français' })).toBeChecked());
  });

  it('picking Français applies at once (html[lang]) and is kept in the store and as a hint', async () => {
    const user = userEvent.setup();
    const bundle = await unlockedBundle();
    await renderInSession(<LanguageScreen />, { bundle, wrapper: withProvider });
    expect(document.documentElement.lang).toBe('en');
    await user.click(screen.getByRole('radio', { name: 'Français' }));
    expect(currentLocale()).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    await waitFor(async () => expect(await bundle.kv.read(KV_KEYS.uiLocale)).toBe('fr'));
    expect(window.localStorage.getItem(LOCALE_HINT_KEY)).toBe('fr');
  });

  it('going back to Match my device removes the stored value and the hint and follows the browser', async () => {
    const user = userEvent.setup();
    const bundle = await openLanguage('fr');
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Français' })).toBeChecked());
    await user.click(screen.getByRole('radio', { name: 'Match my device' }));
    expect(currentLocale()).toBe('en'); // jsdom's navigator.language is en-US
    await waitFor(async () => expect(await bundle.kv.read(KV_KEYS.uiLocale)).toBeNull());
    expect(window.localStorage.getItem(LOCALE_HINT_KEY)).toBeNull();
  });

  it('applies the stored preference before the first screen renders, and the screen starts on it', async () => {
    const bundle = await unlockedBundle();
    await bundle.kv.write(KV_KEYS.uiLocale, 'fr');
    const seen: string[] = [];
    const Probe = () => {
      seen.push(currentLocale());
      return <LanguageScreen />;
    };
    await renderInSession(<Probe />, { bundle });
    expect(seen[0]).toBe('fr');
    expect(screen.getByRole('radio', { name: 'Français' })).toBeChecked(); // checked on first paint
    expect(window.localStorage.getItem(LOCALE_HINT_KEY)).toBe('fr');
  });

  it('has no axe violations', async () => {
    await renderInSession(<LanguageScreen />, { bundle: await unlockedBundle() });
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
