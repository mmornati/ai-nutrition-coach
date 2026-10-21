import { describe, expect, it } from 'vitest';
import {
  AI_NOTE_QUESTION_KEY,
  COACH_LIMITS,
  containsNumberWithUnit,
  detectSupportSignal,
  isAiCoachNote,
  parseAiCoachNote,
  validateCoachText,
} from '../src/index';

const on = { maxChars: 280, numbersOn: true } as const;
const off = { maxChars: 280, numbersOn: false } as const;

describe('validateCoachText', () => {
  it('accepts a calm, specific note and collapses its whitespace', () => {
    const r = validateCoachText(
      '  Lentils and rice\n make a steady lunch. What did you have with it?',
      on,
    );
    expect(r).toEqual({
      ok: true,
      text: 'Lentils and rice make a steady lunch. What did you have with it?',
    });
  });

  it.each([
    ['empty', '   ', 'empty'],
    ['not a string', 42, 'empty'],
    ['too long', 'a'.repeat(281), 'tooLong'],
    ['a scheme link', 'See https://example.org for more', 'url'],
    ['a www link', 'Try www.example.org', 'url'],
    ['a bare domain', 'Read example.com tonight', 'url'],
    ['an exclamation mark', 'Lovely plate!', 'exclamation'],
    ['a streak', 'Keep your streak going', 'bannedWord'],
    ['a score', 'Your score today is fine', 'bannedWord'],
    ['remaining', 'You have 300 remaining', 'bannedWord'],
    ['over budget', 'You went over budget', 'bannedWord'],
    ['praise as reward', 'Great job today', 'bannedWord'],
    ['French series', 'Votre série continue', 'bannedWord'],
    ['French restantes', 'Il vous reste 300 calories restantes', 'bannedWord'],
    ['French dépassé', 'Vous avez dépassé votre repère', 'bannedWord'],
    ['diagnose', 'This might diagnose a deficiency', 'medicalClaim'],
    ['cure', 'Fibre can cure tiredness', 'medicalClaim'],
    ['French diagnostic', 'Ceci pose un diagnostic', 'medicalClaim'],
    ['French guérir', 'Cela peut guérir la fatigue', 'medicalClaim'],
    ['two questions', 'Was it filling? Did you enjoy it?', 'tooManyQuestions'],
  ] as const)('refuses %s', (_name, text, problem) => {
    expect(validateCoachText(text, on)).toEqual({ ok: false, problem });
  });

  it('does not take "secure" or "accurate" for "cure"', () => {
    expect(validateCoachText('A secure, accurate plate.', on).ok).toBe(true);
  });

  it('allows the number of questions the caller asks for', () => {
    const text = 'Was it filling? Did you enjoy it?';
    expect(validateCoachText(text, { ...on, maxQuestions: 2 }).ok).toBe(true);
  });

  it('refuses an amount while numbers are off, and only then', () => {
    for (const text of [
      'About 18 g of sugars.',
      'Around 400 kcal.',
      '20% of the guide',
      '1,5 g of salt',
    ]) {
      expect(validateCoachText(text, off)).toEqual({ ok: false, problem: 'numbersOff' });
      expect(validateCoachText(text, on).ok).toBe(true);
    }
    // A number that is not an amount is fine.
    expect(validateCoachText('Two eggs and 3 tomatoes', off).ok).toBe(true);
    expect(containsNumberWithUnit('at 12 grams')).toBe(true);
    expect(containsNumberWithUnit('great gains')).toBe(false);
  });
});

describe('parseAiCoachNote', () => {
  it('reads the JSON contract, also inside a code fence', () => {
    const json =
      '{"note":"Beans and greens: a good pairing. What will you eat tonight?","followUp":"Do you like them cold?"}';
    expect(parseAiCoachNote(json, true)).toEqual({
      note: 'Beans and greens: a good pairing. What will you eat tonight?',
      followUp: 'Do you like them cold?',
    });
    expect(parseAiCoachNote('```json\n' + json + '\n```', true)?.note).toContain('Beans');
  });

  it.each([
    ['not JSON', 'Here is a note'],
    ['an array', '[{"note":"x"}]'],
    ['a missing note', '{"followUp":"Hm?"}'],
    ['a non-string note', '{"note":3,"followUp":""}'],
    ['an invalid note', '{"note":"Great job!","followUp":""}'],
    ['a too long note', `{"note":"${'a'.repeat(COACH_LIMITS.noteChars + 1)}","followUp":""}`],
    ['two questions', '{"note":"A? B?","followUp":""}'],
    ['broken JSON', '{"note": "x",'],
  ])('returns null for %s', (_n, raw) => {
    expect(parseAiCoachNote(raw, true)).toBeNull();
  });

  it('drops a bad follow-up without losing the note', () => {
    const r = parseAiCoachNote(
      '{"note":"Nice colours on this plate.","followUp":"Why not try this link https://x.org?"}',
      true,
    );
    expect(r).toEqual({ note: 'Nice colours on this plate.', followUp: '' });
    expect(parseAiCoachNote('{"note":"Nice colours."}', true)).toEqual({
      note: 'Nice colours.',
      followUp: '',
    });
  });

  it('refuses a note with an amount while numbers are off', () => {
    expect(parseAiCoachNote('{"note":"About 18 g of sugars.","followUp":""}', false)).toBeNull();
  });
});

describe('detectSupportSignal', () => {
  it.each([
    'I binge at night and then purge',
    'I have been starving myself',
    'I keep making myself throw up after dinner',
    'I think I have an eating disorder',
    'I take laxatives after meals',
    'I hate my body when I eat',
    'je me fais vomir après les repas',
    'Je fais des crises de boulimie',
    'Je me prive de manger depuis des jours',
    'je pense avoir un trouble du comportement alimentaire',
    'Je ne mange plus du tout',
  ])('routes an eating worry: %s', (text) => {
    expect(detectSupportSignal(text)).toBe('eatingWorry');
  });

  it.each([
    'I get chest pain after eating',
    'I almost fainted at lunch',
    "J'ai des douleurs à la poitrine après manger",
    "J'ai eu un malaise hier soir",
  ])('routes a symptom: %s', (text) => {
    expect(detectSupportSignal(text)).toBe('medicalSymptom');
  });

  it.each([
    'What could I eat with lentils?',
    'Comment manger plus de légumes ?',
    'Is my breakfast varied enough?',
  ])('lets an ordinary question through: %s', (text) => {
    expect(detectSupportSignal(text)).toBeNull();
  });

  it('says eating worry first when both are present', () => {
    expect(detectSupportSignal('I purge and feel dizzy')).toBe('eatingWorry');
  });
});

describe('AI note keys', () => {
  it('recognise the rows the AI coach writes', () => {
    expect(isAiCoachNote({ questionKey: AI_NOTE_QUESTION_KEY })).toBe(true);
    expect(isAiCoachNote({ questionKey: 'depth.followUp.ai' })).toBe(true);
    expect(isAiCoachNote({ questionKey: 'post.resolve.vegLight' })).toBe(false);
  });
});
