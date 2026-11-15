// Every count-dependent line of the week review added in the goal-aware lot has a singular and a
// plural form in English and French (the i18n layer's `plural`, one/other), so "1 logged day" and
// "1 jour noté" read right: each line rendered with 0, 1 and 2.
import { describe, expect, it } from 'vitest';
import { copyTemplate } from '../../app/coach-copy';
import { en } from '../../i18n/en';
import { fr } from '../../i18n/fr';
import { fill, type PluralForms, type Strings } from '../../i18n';
import type { Locale } from '../../i18n/locale';

type Catalogue = Strings;
const isForms = (v: unknown): v is PluralForms =>
  typeof v === 'object' && v !== null && 'one' in v && 'other' in v;

/** The lines and the placeholder that decides their singular or plural. */
function lines(all: Catalogue): readonly (readonly [string, PluralForms, string])[] {
  const r = all.week.review;
  const out: (readonly [string, PluralForms, string])[] = [];
  const add = (group: string, record: Readonly<Record<string, unknown>>, count: string) => {
    for (const [key, value] of Object.entries(record)) {
      if (isForms(value)) out.push([`${group}.${key}`, value, count]);
    }
  };
  add('energy', r.energy, 'days');
  add('weightLine', r.weightLine, 'weeks');
  add('suggestions', r.suggestions, 'of');
  add('quality', r.quality, 'of');
  add('stepReview', r.stepReview, 'of');
  return out;
}

const SINGULAR_BUG: Readonly<Record<Locale, RegExp>> = {
  // "1 logged days", "of the 1 lunches", "1 weeks"
  en: /\b1 (?:[a-z-]+ ){0,3}(?:days|weeks|lunches|dinners|breakfasts|foods)\b/,
  fr: /\b1 (?:[a-zéèêî-]+ ){0,3}(?:jours|semaines|déjeuners|dîners|petits-déjeuners|féculents|notés|comptés)\b/,
};

for (const [locale, all] of [
  ['en', en],
  ['fr', fr],
] as const) {
  describe(`${locale}: the week review's counted lines have singular and plural forms`, () => {
    const all2 = lines(all);
    it('has the lines (energy, weight, suggestion, quality and step review)', () => {
      expect(all2.length).toBeGreaterThanOrEqual(25);
    });
    for (const [path, forms, count] of all2) {
      it(`${path}: 0, 1 and 2`, () => {
        const rendered = [0, 1, 2].map((n) =>
          fill(copyTemplate(forms, n, locale), {
            days: String(n),
            weeks: String(n),
            of: String(n),
            matched: '1',
            n: '1',
            kg: '1,5',
            avg: '1 500',
            guide: '1 700',
            relation: 'près de',
          }),
        );
        for (const text of rendered) {
          expect(text).not.toMatch(/[{}]/);
          expect(text).not.toMatch(SINGULAR_BUG[locale]);
        }
        // The count decides: one thing differs from many (0 reads like 1 in French, like 2 in English).
        expect(rendered[1]).not.toBe(rendered[2]);
        expect(forms.one).toContain(`{${count}}`);
        expect(forms.other).toContain(`{${count}}`);
      });
    }
  });
}

describe('examples', () => {
  it('reads "1 logged day" and "6 logged days"; "1 jour noté" and "6 jours notés"', () => {
    const q = en.week.review.quality.fishLow;
    expect(fill(copyTemplate(q, 1, 'en'), { days: '1', of: '1' })).toContain('1 of 1 logged day.');
    expect(fill(copyTemplate(q, 6, 'en'), { days: '2', of: '6' })).toContain('2 of 6 logged days.');
    const f = fr.week.review.quality.fishLow;
    expect(fill(copyTemplate(f, 1, 'fr'), { days: '1', of: '1' })).toContain(
      '1 fois sur 1 jour noté.',
    );
    expect(fill(copyTemplate(f, 6, 'fr'), { days: '2', of: '6' })).toContain(
      '2 fois sur 6 jours notés.',
    );
  });
  it('the verb of the wholegrain step line agrees with every count', () => {
    const w = en.week.review.stepReview.wholegrainWeek;
    expect(fill(copyTemplate(w, 6, 'en'), { matched: '1', of: '6' })).toContain(
      'Wholegrain was 1 of the 6 grain-based starchy foods logged.',
    );
  });
});
