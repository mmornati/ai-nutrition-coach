import { describe, expect, it, vi } from 'vitest';
import { intlTag, isLocale, perLocale, resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('an explicit preference wins over the hint and the browser', () => {
    expect(resolveLocale('en', 'fr', ['fr-FR'])).toBe('en');
    expect(resolveLocale('fr', 'en', ['en-GB'])).toBe('fr');
  });

  it('null and "system" follow the hint, then the browser', () => {
    expect(resolveLocale(null, 'fr', ['en-GB'])).toBe('fr');
    expect(resolveLocale('system', 'en', ['fr-FR'])).toBe('en');
    expect(resolveLocale('system', null, ['fr-CA', 'en'])).toBe('fr');
    expect(resolveLocale(undefined, undefined, ['en-US', 'fr'])).toBe('fr');
  });

  it('picks the first SUPPORTED entry of the language list, not just the first', () => {
    expect(resolveLocale(null, null, ['de-DE', 'fr-FR'])).toBe('fr');
    expect(resolveLocale(null, null, ['fr-FR', 'en-US'])).toBe('fr');
    expect(resolveLocale(null, null, ['de-DE', 'es'])).toBe('en');
  });

  it('falls back to navigator.language when the list is empty or missing', () => {
    expect(resolveLocale(null, null, [], 'fr-CA')).toBe('fr');
    expect(resolveLocale(null, null, undefined, 'fr')).toBe('fr');
    expect(resolveLocale(null, null, null, 'fr-FR')).toBe('fr');
    expect(resolveLocale(null, null, [], 'de')).toBe('en');
    // A non-empty list wins over the single value.
    expect(resolveLocale(null, null, ['en-US'], 'fr')).toBe('en');
  });

  it('"system" or no preference with no hint and no languages is English', () => {
    expect(resolveLocale('system', null, [])).toBe('en');
    expect(resolveLocale(null, undefined, undefined)).toBe('en');
    expect(resolveLocale('system', null, [], '')).toBe('en');
  });

  it('maps any fr* tag to French and everything else to English', () => {
    for (const tag of ['fr', 'FR', 'fr-FR', 'fr_CA', 'fr-Latn-BE', ' fr-CH ']) {
      expect(resolveLocale(null, null, [tag])).toBe('fr');
    }
    for (const tag of ['en', 'de-DE', 'es', 'frisian', 'fra', 'ja-JP']) {
      expect(resolveLocale(null, null, [tag])).toBe('en');
    }
  });

  it('never throws on malformed input', () => {
    const garbage: unknown[] = ['', '   ', '-', '--fr', '@@@', 'f', '\u0000fr', 42, null, {}, []];
    for (const g of garbage) {
      expect(() => resolveLocale(null, null, [g as string])).not.toThrow();
      expect(resolveLocale(null, null, [g as string])).toBe('en');
    }
    expect(resolveLocale(null, null, [])).toBe('en');
    expect(resolveLocale(null, null, null)).toBe('en');
    expect(resolveLocale(null, null, 'fr' as unknown as string[])).toBe('en');
    expect(resolveLocale('de' as never, 'xx', ['fr'])).toBe('fr');
  });
});

describe('locale helpers', () => {
  it('recognises supported locales only', () => {
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it('caches one Intl object per locale', () => {
    const make = vi.fn((tag: string) => new Intl.DateTimeFormat(tag));
    const get = perLocale(make);
    expect(get('en')).toBe(get('en'));
    expect(get('fr')).not.toBe(get('en'));
    expect(get('fr')).toBe(get('fr'));
    expect(make).toHaveBeenCalledTimes(2);
    expect(make).toHaveBeenCalledWith(intlTag('fr'), 'fr');
  });
});
