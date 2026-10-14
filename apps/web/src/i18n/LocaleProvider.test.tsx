import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from './LocaleProvider';
import { currentLocale, joinNames, plural, setCurrentLocale, useLocale, useStrings } from './index';
import { DEFAULT_LOCALE } from './locale';
import { formatDaySpan } from '../components/day/format';

function Probe() {
  const { locale, setLocale } = useLocale();
  const s = useStrings();
  return (
    <button type="button" onClick={() => setLocale('fr')} data-locale={locale}>
      {s.common.close}
    </button>
  );
}

afterEach(() => {
  setCurrentLocale(DEFAULT_LOCALE);
  document.documentElement.lang = '';
});

describe('LocaleProvider', () => {
  it('sets html[lang] and the current locale from the initial value', () => {
    render(
      <LocaleProvider initial="en">
        <Probe />
      </LocaleProvider>,
    );
    expect(document.documentElement.lang).toBe('en');
    expect(currentLocale()).toBe('en');
  });

  it('re-renders and updates html[lang] when the locale switches', () => {
    render(
      <LocaleProvider initial="en">
        <Probe />
      </LocaleProvider>,
    );
    const button = screen.getByRole('button');
    expect(button.dataset.locale).toBe('en');
    act(() => button.click());
    expect(screen.getByRole('button').dataset.locale).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(currentLocale()).toBe('fr');
    // No French copy yet: the catalogue falls back to English.
    expect(screen.getByRole('button').textContent).toBe('Close');
  });

  it('makes the non-hook helpers follow the locale', () => {
    render(
      <LocaleProvider initial="fr">
        <Probe />
      </LocaleProvider>,
    );
    expect(joinNames(['a', 'b'])).toBe('a et b');
    expect(joinNames(['a', 'b'], 'en')).toBe('a and b');
    expect(plural({ one: '{count} x', other: '{count} xs' }, 0)).toBe('0 x');
    expect(plural({ one: '{count} x', other: '{count} xs' }, 0, 'en')).toBe('0 xs');
    const day = new Date(2026, 9, 7).getTime();
    expect(formatDaySpan(day, day + 6 * 86_400_000)).toContain('octobre');
  });

  it('follows a switch made outside React (the module setter), and ignores a changed `initial`', () => {
    const view = render(
      <LocaleProvider initial="en">
        <Probe />
      </LocaleProvider>,
    );
    act(() => setCurrentLocale('fr'));
    expect(screen.getByRole('button').dataset.locale).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    view.rerender(
      <LocaleProvider initial="en">
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByRole('button').dataset.locale).toBe('fr');
  });
});
