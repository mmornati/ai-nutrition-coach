import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/en';
import { fr } from '../../i18n/fr';
import { noteQuestion } from './coach';

describe('noteQuestion', () => {
  it('reads a stored note’s question in the current language by its key', () => {
    const note = { questionKey: 'openPlate.vegLight', text: 'old text' };
    expect(noteQuestion(en, note)).toBe(en.coachQuestions['openPlate.vegLight']);
    expect(noteQuestion(fr, note)).toBe(fr.coachQuestions['openPlate.vegLight']);
  });

  it('falls back to the stored text for a key the catalogue no longer has', () => {
    expect(noteQuestion(fr, { questionKey: 'gone.key', text: 'kept text' })).toBe('kept text');
  });

  it('never reads an inherited property: a key like `toString` falls back to the stored text', () => {
    for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(noteQuestion(en, { questionKey: key, text: 'kept text' })).toBe('kept text');
    }
  });
});

describe('noteQuestion with numbers', () => {
  const key = 'post.resolve.proteinLowDay?g=7.5&pct=15&est=0';
  it('formats the raw values in the current language', () => {
    expect(noteQuestion(en, { questionKey: key, text: 'x' })).toMatch(
      /^Protein so far today is 7\.5 g, around 15% of a day’s guide\./,
    );
    expect(noteQuestion(fr, { questionKey: key, text: 'x' }, 'fr')).toMatch(
      /^Les protéines d’aujourd’hui font 7,5 g pour l’instant, soit environ 15\u202F% de la référence/,
    );
  });
  it('puts a tilde before an estimate and uses the food name as given', () => {
    const k = 'post.resolve.sugarsHighItem?food=Yaourt%20%C3%A0%20boire&g=18&pct=20&est=1';
    expect(noteQuestion(en, { questionKey: k, text: 'x' })).toMatch(
      /^This Yaourt à boire has ~18 g/,
    );
  });
});

describe('noteQuestion for a day with none of the nutrient', () => {
  it('says so plainly, and never prints "0%"', () => {
    const none = { questionKey: 'post.resolve.fibreLowDay?zero=1', text: 'x' };
    expect(noteQuestion(en, none)).toMatch(/^No fibre logged so far today\./);
    const tiny = { questionKey: 'post.resolve.fibreLowDay?g=0.1&pct=0&est=0', text: 'x' };
    expect(noteQuestion(en, tiny)).toContain('less than 1% of a day’s guide');
    expect(noteQuestion(en, tiny)).not.toMatch(/\b0%/);
  });
});
