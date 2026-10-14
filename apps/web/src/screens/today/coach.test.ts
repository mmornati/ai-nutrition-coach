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
