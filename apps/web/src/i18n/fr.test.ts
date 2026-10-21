// The French catalogue against the English one (same keys, same placeholders, same plural forms,
// same list lengths) and against French typography (narrow no-break space before `: ; ? !` and
// inside « », typographic apostrophe). Then the sentence builders in French, end to end.
import { afterEach, describe, expect, it } from 'vitest';
import { en } from './en';
import { fr } from './fr';
import { setCurrentLocale } from './index';
import { DEFAULT_LOCALE } from './locale';
import { catalogueLeaves as leaves } from './testing';
import {
  daySentence,
  lineName,
  noteQuietDays,
  noteQuietNever,
  noteSome,
  passedThrough,
  platesCount,
  routeStop,
  stationLabel,
  syncAnnouncement,
} from './sentences';

const NNBSP = '\u202F';

/** Every object whose keys include `one` and `other`: a plural form set. */
function pluralSets(node: unknown, path = ''): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (node === null || typeof node !== 'object') return out;
  if (!Array.isArray(node) && 'one' in node && 'other' in node) {
    out.set(path, Object.keys(node).sort());
  }
  for (const [key, value] of Object.entries(node)) {
    pluralSets(value, path ? `${path}.${key}` : key).forEach((v, k) => out.set(k, v));
  }
  return out;
}

const placeholders = (s: string): string[] =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

const enLeaves = leaves(en);
const frLeaves = leaves(fr);

describe('fr catalogue parity with en', () => {
  it('has exactly the same key paths (array lengths included)', () => {
    expect([...frLeaves.keys()].sort()).toEqual([...enLeaves.keys()].sort());
  });

  it('keeps every string’s set of {placeholders}', () => {
    const mismatched = [...enLeaves]
      .filter(([path, text]) => {
        const other = frLeaves.get(path);
        return other === undefined || placeholders(other).join() !== placeholders(text).join();
      })
      .map(([path]) => path);
    expect(mismatched).toEqual([]);
  });

  it('has the same plural forms (zero/one/other) as en', () => {
    expect(pluralSets(fr)).toEqual(pluralSets(en));
  });

  it('translates the copy (only names, formats and technical values may stay identical)', () => {
    const SAME_ALLOWED =
      /^(?:shell\.brand|export\.format(?:Csv|Json|Label)|yourData\.exportHeading|offNotice\.ok|portion\.label|foods\.portions\.portion|nutrition\.sectionTitle|nutritionSettings\.title|settings\.rowNutrition|foods\.names\.(?:orange|tofu|quinoa|tortilla)|install\.(?:android|ios)Title|ai\.yourAi\.(?:endpointHint)|week\.(?:networkDescription|noteJoin|sentences|routeStop)|aboutScreen\.licences\[\d\]\.(?:id|name|licence)|session\.lockAfterOptions\[\d\]|ai\.failure\.httpStatus)$/;
    const untranslated = [...enLeaves]
      .filter(([path, text]) => frLeaves.get(path) === text && !SAME_ALLOWED.test(path))
      .filter(([, text]) => /[a-z]{3}/i.test(text.replace(/\{\w+\}/g, '')))
      .map(([path]) => path);
    expect(untranslated).toEqual([]);
  });
});

describe('fr typography', () => {
  /**
   * Text with placeholders, URLs and the technical tokens that really occur (a model id's
   * `:free`, a `12:30` time) blanked out. Any other colon stays, so `Stockage:protégé` is flagged.
   */
  const prose = (text: string): string =>
    text
      .replace(/\{\w+\}/g, 'X')
      .replace(/\b[a-z][\w+.-]*:\/\/\S*/gi, 'URL')
      .replace(/\b[\w.-]+\/[\w.-]+:free\b/g, 'MODEL')
      .replace(/\d:\d/g, '0x0');

  it('puts a narrow no-break space (U+202F) before every : ; ? !', () => {
    const bad = [...frLeaves]
      .filter(([, text]) => {
        const p = prose(text);
        return [...p.matchAll(/[;:?!]/g)].some((m) => p[(m.index ?? 0) - 1] !== NNBSP);
      })
      .map(([path, text]) => `${path}: ${JSON.stringify(text)}`);
    expect(bad).toEqual([]);
  });

  it('puts a narrow no-break space inside « » and never uses straight or curly English quotes', () => {
    const bad = [...frLeaves]
      .filter(([, text]) => /«(?!\u202F)|(?<!\u202F)»/.test(text) || /["“”]/.test(text))
      .map(([path]) => path);
    expect(bad).toEqual([]);
  });

  it('uses the typographic apostrophe, never a straight one', () => {
    expect([...frLeaves].filter(([, text]) => text.includes("'")).map(([path]) => path)).toEqual(
      [],
    );
  });

  it('uses the ellipsis character, never three dots', () => {
    expect([...frLeaves].filter(([, text]) => text.includes('...')).map(([path]) => path)).toEqual(
      [],
    );
  });

  it('carries none of the banned pressure vocabulary (the No-Dark-Patterns Standard)', () => {
    const BANNED =
      /séries?\b|compte à rebours|badge|bravo|félicitations|culpabilit|score|\bpoints\b|record|\brestantes?\b|dépassé|hors budget|\bsuper\b|\bgénial|\bréussi|\béchec|\braté|\bmanqué/i;
    const bad = [...frLeaves]
      .filter(([path]) => path !== 'week.noStreaks') // the footnote that names the ban
      .filter(([, text]) => BANNED.test(text))
      .map(([path]) => path);
    expect(bad).toEqual([]);
  });

  it('has no exclamation marks (the voice never exclaims)', () => {
    expect([...frLeaves].filter(([, text]) => text.includes('!')).map(([path]) => path)).toEqual(
      [],
    );
  });

  it('the checker itself flags a plain space, a no-break space and a missing space', () => {
    const flagged = (text: string) => {
      const p = prose(text);
      return [...p.matchAll(/[;:?!]/g)].some((m) => p[(m.index ?? 0) - 1] !== NNBSP);
    };
    expect(flagged('Tout effacer ?')).toBe(true);
    expect(flagged('Tout effacer ?')).toBe(true);
    expect(flagged('Stockage: protégé')).toBe(true);
    expect(flagged('Stockage:protégé')).toBe(true);
    expect(flagged(`Tout effacer${NNBSP}?`)).toBe(false);
    expect(flagged('https://openrouter.ai/api/v1')).toBe(false);
    expect(flagged('p. ex. google/gemini-2.0-flash-exp:free')).toBe(false);
    expect(flagged('à 12:30')).toBe(false);
  });
});

describe('sentence builders in French', () => {
  afterEach(() => setCurrentLocale(DEFAULT_LOCALE));
  const n = NNBSP;

  it('builds station and day-board lines with the template’s word order', () => {
    setCurrentLocale('fr');
    expect(lineName('vegFruit')).toBe('fruits & légumes');
    expect(passedThrough(['laitages'])).toBe(`Laitages${n}: passage sans arrêt`);
    expect(
      stationLabel({
        meal: 'Déjeuner',
        time: '12:55',
        present: ['protéines'],
        passed: ['laitages'],
      }),
    ).toBe(`Ouvrir Déjeuner, 12:55${n}: arrêt pour protéines. Laitages${n}: passage sans arrêt`);
    expect(stationLabel({ meal: 'Dîner', time: '20:00', present: [], passed: [] })).toBe(
      `Ouvrir Dîner, 20:00${n}: aucun arrêt`,
    );
  });

  it('builds week notes with the name mid-sentence, lower-case', () => {
    setCurrentLocale('fr');
    expect(noteSome(['protéines', 'féculents'])).toBe(
      `En service cette semaine${n}: protéines et féculents.`,
    );
    expect(noteQuietDays('laitages', ['lundi', 'mercredi'])).toBe(
      'La ligne laitages est restée calme lundi et mercredi.',
    );
    expect(noteQuietNever(['laitages'])).toBe(
      'La ligne laitages est restée calme toute la semaine.',
    );
    expect(noteQuietNever(['laitages', 'féculents'])).toBe(
      'Les lignes laitages et féculents sont restées calmes cette semaine.',
    );
  });

  it('capitalises a lower-case weekday that opens a sentence', () => {
    setCurrentLocale('fr');
    expect(daySentence('lundi', 'les quatre lignes')).toBe(`Lundi${n}: les quatre lignes.`);
    expect(routeStop('mardi', '2 sur 4 lignes', false)).toBe('Mardi, 2 sur 4 lignes');
  });

  it('picks French plural forms (0 and 1 are both `one`; an explicit zero wins)', () => {
    setCurrentLocale('fr');
    expect(platesCount(0)).toBe('Aucune assiette');
    expect(platesCount(1)).toBe('1 assiette');
    expect(platesCount(2)).toBe('2 assiettes');
    expect(syncAnnouncement(1, 0)).toBe('1 assiette en attente de synchronisation');
    expect(syncAnnouncement(0, 3)).toBe('Nouvel essai plus tard pour 3 assiettes');
  });

  it('leaves the English output unchanged', () => {
    expect(passedThrough(['dairy'])).toBe('Dairy passed through without a stop');
    expect(noteQuietDays('dairy', ['Monday', 'Wednesday'])).toBe(
      'Dairy was quiet on Monday and Wednesday.',
    );
    expect(noteQuietNever(['dairy', 'starch'])).toBe('Dairy and starch were quiet this week.');
    expect(daySentence('Monday', 'all four lines')).toBe('Monday: all four lines.');
  });
});
