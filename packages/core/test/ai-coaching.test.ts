import { describe, expect, it } from 'vitest';
import {
  AI_NOTE_QUESTION_KEY,
  aiNoteLocale,
  aiQuestionKey,
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
    'I keep binging',
    'I have been starving myself',
    'I keep making myself throw up after dinner',
    'I threw up after dinner',
    'I think I have an eating disorder',
    'I take laxatives after meals',
    'I hate my body when I eat',
    'I skip meals to lose weight',
    'how can I eat 600 calories a day',
    "I haven't eaten in 3 days",
    'I have been fasting for 3 days',
    'je me fais vomir après les repas',
    'Je fais des crises de boulimie',
    'Je me prive de manger depuis des jours',
    'je pense avoir un trouble du comportement alimentaire',
    'Je ne mange plus du tout',
    'je mange plus rien',
    'je saute des repas',
    'Je jeûne depuis 2 jours',
    'Je jeune depuis 2 jours',
    'J’ai de l’hyperphagie',
    'Comment manger 800 calories par jour ?',
  ])('routes an eating worry: %s', (text) => {
    expect(detectSupportSignal(text)).toBe('eatingWorry');
  });

  it.each([
    'I want to kill myself',
    'I think about suicide',
    'I want to die',
    'self harm',
    'je veux mourir',
    'Je veux me faire du mal',
    'j’ai envie d’en finir',
  ])('routes thoughts of self-harm: %s', (text) => {
    expect(detectSupportSignal(text)).toBe('selfHarm');
  });

  it.each([
    'I get chest pain after eating',
    'I almost fainted at lunch',
    'I passed out after dinner',
    "I can't breathe after the nuts",
    'My throat is swelling after peanuts',
    'I think it is anaphylaxis',
    'I had a severe allergic reaction',
    "J'ai des douleurs à la poitrine après manger",
    'Je me suis évanoui',
    'Je me suis evanoui hier',
    'reaction allergique aux cacahuètes',
    'Ma gorge gonfle après les noix',
    'Je n’arrive pas à respirer',
  ])('routes a possible emergency: %s', (text) => {
    expect(detectSupportSignal(text)).toBe('urgent');
  });

  it.each(['I feel dizzy after lunch', "J'ai eu un malaise hier soir", 'J’ai des vertiges'])(
    'routes another symptom: %s',
    (text) => {
      expect(detectSupportSignal(text)).toBe('medicalSymptom');
    },
  );

  it.each([
    'What could I eat with lentils?',
    'Comment manger plus de légumes ?',
    'Is my breakfast varied enough?',
    'Un jeune de 20 ans peut-il manger des lentilles ?',
    'Is 2000 calories a day the guide?',
  ])('lets an ordinary question through: %s', (text) => {
    expect(detectSupportSignal(text)).toBeNull();
  });

  it('puts self-harm before an emergency before an eating worry before a symptom', () => {
    expect(detectSupportSignal('I purge and want to die')).toBe('selfHarm');
    expect(detectSupportSignal('I purge and have chest pain')).toBe('urgent');
    expect(detectSupportSignal('I purge and feel dizzy')).toBe('eatingWorry');
  });

  it('sees through fullwidth letters and invisible characters', () => {
    expect(detectSupportSignal('ｂｉｎｇｅ')).toBe('eatingWorry');
    expect(detectSupportSignal('chest​ pain')).toBe('urgent');
  });
});

describe('validateCoachText: harmful advice', () => {
  it.each([
    'Skip dinner tonight and fast until lunch.',
    'You could skip breakfast tomorrow.',
    'Try intermittent fasting.',
    'Eat 800 kcal a day for a while.',
    'Aim for 1000 calories per day.',
    'This helps you lose weight.',
    'A calorie deficit is the way.',
    'Cut calories at dinner.',
    'Sautez le dîner ce soir.',
    'Vous pouvez sauter un repas.',
    'Un jeûne de quelques heures aide.',
    'Pour perdre du poids, mangez moins.',
    'Un déficit calorique est utile.',
    'Un laxatif peut aider.',
  ])('refuses %s', (text) => {
    expect(validateCoachText(text, on)).toEqual({ ok: false, problem: 'harmfulAdvice' });
  });

  it('allows an ordinary energy figure and words that only look similar', () => {
    expect(validateCoachText('About 2000 kcal a day is the guide.', on).ok).toBe(true);
    expect(validateCoachText('Un jeune pousse de soja.', on).ok).toBe(true);
    expect(validateCoachText('A breakfast with oats suits you.', on).ok).toBe(true);
  });
});

describe('validateCoachText: normalisation and numbers', () => {
  it.each([
    'About 400 calories here.',
    'About 400 kilocalories here.',
    'About 20 percent of the guide.',
    'About 20 pour cent du repère.',
    'About ２０ g of sugars.',
    'About 2​0 g of sugars.',
    'About 18g of sugars.',
  ])('refuses an amount while numbers are off: %s', (text) => {
    expect(validateCoachText(text, off)).toEqual({ ok: false, problem: 'numbersOff' });
    expect(containsNumberWithUnit(text)).toBe(true);
  });

  it('refuses the same text with an invisible character or a fullwidth mark', () => {
    expect(validateCoachText('Lovely plate​!', on)).toMatchObject({ problem: 'exclamation' });
    expect(validateCoachText('Lovely plate！', on)).toMatchObject({ problem: 'exclamation' });
    expect(validateCoachText('Lovely plate‼', on)).toMatchObject({ problem: 'exclamation' });
    expect(validateCoachText('¡Lovely plate', on)).toMatchObject({ problem: 'exclamation' });
    expect(validateCoachText('Visit exa​mple.com', on)).toMatchObject({ problem: 'url' });
    expect(validateCoachText('Visit example.museum', on)).toMatchObject({ problem: 'url' });
    expect(validateCoachText('Visit www.example', on)).toMatchObject({ problem: 'url' });
  });

  it.each([
    'Great work today.',
    'You nailed it.',
    'A perfect plate.',
    'Un repas parfait.',
    'Bien joué.',
    'Il vous reste de la place.',
    'Plenty of kcal left.',
  ])('refuses praise and pressure: %s', (text) => {
    expect(validateCoachText(text, on)).toMatchObject({ ok: false, problem: 'bannedWord' });
  });

  it('keeps non-breaking spaces and returns the normalised text', () => {
    const r = validateCoachText('Des  légumes ?', { ...on, locale: 'fr' });
    expect(r).toEqual({ ok: true, text: 'Des légumes\u202f?' });
  });

  it('French typography: U+202F before ? ; : and inside « », not inside a time', () => {
    const r = validateCoachText('Un peu de vert ? À 12:30, « des légumes »; non :', {
      ...on,
      locale: 'fr',
      maxQuestions: 2,
    });
    expect(r).toEqual({
      ok: true,
      text: 'Un peu de vert\u202f? À 12:30, «\u202fdes légumes\u202f»\u202f; non\u202f:',
    });
    expect(validateCoachText('Des légumes ?', on)).toEqual({ ok: true, text: 'Des légumes ?' });
  });
});

describe('AI note keys', () => {
  it('recognise the rows the AI coach writes, with or without the language', () => {
    expect(isAiCoachNote({ questionKey: AI_NOTE_QUESTION_KEY })).toBe(true);
    expect(isAiCoachNote({ questionKey: 'depth.followUp.ai' })).toBe(true);
    expect(isAiCoachNote({ questionKey: aiQuestionKey(AI_NOTE_QUESTION_KEY, 'fr') })).toBe(true);
    expect(isAiCoachNote({ questionKey: 'post.resolve.vegLight' })).toBe(false);
  });

  it('carry the language they were written in', () => {
    expect(aiNoteLocale({ questionKey: aiQuestionKey(AI_NOTE_QUESTION_KEY, 'fr') })).toBe('fr');
    expect(aiNoteLocale({ questionKey: aiQuestionKey('depth.followUp.ai', 'en') })).toBe('en');
    expect(aiNoteLocale({ questionKey: AI_NOTE_QUESTION_KEY })).toBeNull();
  });
});
