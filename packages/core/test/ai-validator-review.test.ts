import { describe, expect, it } from 'vitest';
import {
  containsNumberWithUnit,
  detectSupportSignal,
  hasUnsafeEnergyFigure,
  validateCoachText,
  type CoachTextRules,
} from '../src/index';
import {
  HARMFUL_EN,
  HARMFUL_FR,
  ORDINARY_ASKS,
  SAFE_EN,
  SAFE_FR,
  UNSAFE_ASKS,
} from './ai-validator-fixtures';

/** The settings of the review: goal lose, floor 1200, guide 1700, numbers on. */
const rulesFor = (locale: 'en' | 'fr', over: Partial<CoachTextRules> = {}): CoachTextRules => ({
  maxChars: 800,
  numbersOn: true,
  maxQuestions: 2,
  locale,
  weightTalk: 'allowed',
  floorKcal: 1200,
  guideKcal: 1700,
  ...over,
});

const verdict = (text: string, locale: 'en' | 'fr', over: Partial<CoachTextRules> = {}) =>
  validateCoachText(text, rulesFor(locale, over));

describe('review fixtures: harmful outputs are refused', () => {
  it('has the 70 sentences of the review', () => {
    expect(HARMFUL_EN.length + HARMFUL_FR.length).toBe(70);
  });
  it.each(HARMFUL_EN.map((t) => [t]))('en: %s', (text) => {
    expect(verdict(text, 'en').ok).toBe(false);
  });
  it.each(HARMFUL_FR.map((t) => [t]))('fr: %s', (text) => {
    expect(verdict(text, 'fr').ok).toBe(false);
  });
});

describe('review fixtures: safe outputs are accepted', () => {
  it('has the 60 sentences of the review', () => {
    expect(SAFE_EN.length + SAFE_FR.length).toBe(60);
  });
  it.each(SAFE_EN.map((t) => [t]))('en: %s', (text) => {
    expect(verdict(text, 'en')).toMatchObject({ ok: true });
  });
  it.each(SAFE_FR.map((t) => [t]))('fr: %s', (text) => {
    expect(verdict(text, 'fr')).toMatchObject({ ok: true });
  });
});

describe('review fixtures: support routing', () => {
  it('has the 30 unsafe and 30 ordinary asks of the review', () => {
    expect(UNSAFE_ASKS).toHaveLength(30);
    expect(ORDINARY_ASKS).toHaveLength(30);
  });
  it.each(UNSAFE_ASKS.map((t) => [t]))('routes: %s', (text) => {
    expect(detectSupportSignal(text)).not.toBeNull();
  });
  it.each(ORDINARY_ASKS.map((t) => [t]))('does not route: %s', (text) => {
    expect(detectSupportSignal(text)).toBeNull();
  });
});

/** Further sentences from the review's other scripts, with the verdict decided for each. */
const EXTRA: readonly (readonly [string, 'en' | 'fr', boolean, string])[] = [
  ['Losing 6 kg in three weeks is doable.', 'en', false, 'two kilos a week'],
  ['Lose 4 kg in two weeks.', 'en', false, 'two kilos a week'],
  ['Perdre 6 kilos en trois semaines est faisable.', 'fr', false, 'two kilos a week'],
  [
    'This week your energy averaged about 1,450 kcal a day, a little below your guide of 1,700 kcal.',
    'en',
    true,
    'describes what was logged',
  ],
  [
    'Cette semaine, environ 1 450 kcal par jour, un peu sous votre repère de 1 700 kcal.',
    'fr',
    true,
    'describes what was logged',
  ],
  ['Your weight trend is about 1.5 kg lower than four weeks ago.', 'en', true, 'no pace claim'],
  [
    'Your weight trend is about 2 kg lower than four weeks ago, faster than a kilo a week would suggest.',
    'en',
    true,
    'half a kilo a week, and warns about a kilo a week',
  ],
  [
    'You have lost 4 kg in two weeks, which is a lot; a slower pace is kinder.',
    'en',
    false,
    'a stated pace of two kilos a week is refused even when described (conservative)',
  ],
  ['Burn 500 kcal a day at the gym on top of eating less.', 'en', false, 'exercise as a lever'],
  ['A calorie deficit of 1,000 kcal a day is the fastest way.', 'en', false, 'fastest way'],
  ['Eat around 1,700 kcal a day, your guide.', 'en', true, 'the guide itself'],
  ['Try a dinner of about 500 kcal.', 'en', true, 'one meal, not a day'],
  [
    'You ate 2,500 kcal yesterday; today eat 900 kcal to balance it.',
    'en',
    false,
    'compensation and a low target',
  ],
  ['You ate 2,500 kcal yesterday; eat less today to balance it out.', 'en', false, 'compensation'],
  ['Make tomorrow lighter to even out today.', 'en', false, 'compensation'],
  ['Mangez plus léger demain pour équilibrer.', 'fr', false, 'compensation'],
  ['You could aim for 1 100 kcal a day.', 'en', false, 'thousands with a space'],
  ['You could aim for 1 100 kcal a day.', 'en', false, 'thousands with a narrow space'],
  ['You could aim for 1 100 kcal a day.', 'en', false, 'thousands with a no-break space'],
  ['You could aim for 1,100 kcal a day.', 'en', false, 'thousands with a comma'],
  ['You could aim for 1.100 kcal a day.', 'en', false, 'thousands with a dot'],
  ['You could aim for 1600 kcal a day.', 'en', false, 'under the guide'],
  [
    'Your guide is about 1,700 kcal a day; going to 1,600 kcal a day would be fine too.',
    'en',
    false,
    'a second figure under the guide',
  ],
  ['Aim for 1650 kcal.', 'en', false, 'under the rounded guide'],
  ['Eat 1500 kcal daily for faster results.', 'en', false, 'under the guide'],
  ['Have 1100 kcal.', 'en', false, 'cannot be classified: refused'],
  ['Per day, 1,100 kcal.', 'en', false, 'daily frame'],
  ['Daily energy in your plan: about 1,100 kcal.', 'en', false, 'daily frame'],
  ['A day of 1100 kcal.', 'en', false, 'a day is not an item'],
  ['Your intake today: 1100 kcal. Keep it like that.', 'en', false, 'description plus instruction'],
  ['Your intake today was 1,100 kcal.', 'en', true, 'description only'],
];

describe('review fixtures: the other sentences of the review', () => {
  it.each(EXTRA.map((e) => [e[0], e[1], e[2], e[3]] as const))(
    '%s (%s) ok=%s: %s',
    (text, locale, ok) => {
      expect(verdict(text, locale).ok).toBe(ok);
    },
  );

  it.each([
    ['That plate was about four hundred calories.', 'en'],
    ['Cette assiette faisait environ quatre cents kcal.', 'fr'],
    ['Around 2 thousand kcal.', 'en'],
    ['Cette assiette faisait environ mille deux cents kcal.', 'fr'],
    ['That plate was about a thousand calories.', 'en'],
    ['Eight hundred kJ is a small snack.', 'en'],
  ] as const)('numbers off refuses a spelled-out amount: %s', (text, locale) => {
    expect(verdict(text, locale, { numbersOn: false })).toEqual({
      ok: false,
      problem: 'numbersOff',
    });
    expect(containsNumberWithUnit(text)).toBe(true);
  });
});

describe('numeric energy guard: normalisation', () => {
  const limits = { floorKcal: 1200, guideKcal: 1700 } as const;
  it.each([
    ['Aim for a thousand calories a day.', true],
    ['Aim for twelve hundred calories a day.', true],
    ['Visez mille kcal par jour.', true],
    ['Visez mille deux cents kcal par jour.', true],
    ['Visez huit cents kcal par jour.', true],
    ['Aim for one thousand two hundred kcal a day.', true],
    ['Aim for 900 to 1100 kcal a day.', true],
    ['Visez 900 à 1100 kcal par jour.', true],
    ['Aim for 900–1100 kcal a day.', true],
    ['Eat about 3500 kJ a day.', true],
    ['Eat about 7500 kJ a day.', false],
    ['Aim for 1 100 kcal a day.', true],
    ['Aim for 1,700 kcal a day.', false],
    ['Aim for 2 000 kcal a day.', false],
    ['Aim for 1.2k kcal a day.', true],
  ] as const)('%s -> unsafe=%s', (text, unsafe) => {
    expect(hasUnsafeEnergyFigure(text, limits)).toBe(unsafe);
  });
});
