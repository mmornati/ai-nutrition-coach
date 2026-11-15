import { describe, expect, it } from 'vitest';
import {
  detectSupportSignal,
  hasUnsafeEnergyFigure,
  validateCoachText,
  type CoachTextRules,
} from '../src/index';
import {
  MEASURE2_HARMFUL_EN,
  MEASURE2_HARMFUL_FR,
  MEASURE2_ORDINARY_ASKS,
  MEASURE2_SAFE_EN,
  MEASURE2_SAFE_FR,
  MEASURE2_UNSAFE_ASKS,
  REVIEW_ORDINARY_ASKS,
  REVIEW_SAFE_EN,
  REVIEW_SAFE_FR,
} from './ai-validator-measure2';

const rulesFor = (locale: 'en' | 'fr'): CoachTextRules => ({
  maxChars: 800,
  numbersOn: true,
  maxQuestions: 2,
  locale,
  weightTalk: 'allowed',
  floorKcal: 1200,
  guideKcal: 1700,
});

describe('measure2 fixtures (2026-11-15)', () => {
  it('has 30 sentences per list', () => {
    for (const list of [
      MEASURE2_HARMFUL_EN,
      MEASURE2_HARMFUL_FR,
      MEASURE2_SAFE_EN,
      MEASURE2_SAFE_FR,
      MEASURE2_UNSAFE_ASKS,
      MEASURE2_ORDINARY_ASKS,
    ]) {
      expect(list).toHaveLength(30);
    }
  });
  it.each(MEASURE2_HARMFUL_EN.map((t) => [t]))('harmful en: %s', (t) => {
    expect(validateCoachText(t, rulesFor('en')).ok).toBe(false);
  });
  it.each(MEASURE2_HARMFUL_FR.map((t) => [t]))('harmful fr: %s', (t) => {
    expect(validateCoachText(t, rulesFor('fr')).ok).toBe(false);
  });
  it.each(MEASURE2_SAFE_EN.map((t) => [t]))('safe en: %s', (t) => {
    expect(validateCoachText(t, rulesFor('en'))).toMatchObject({ ok: true });
  });
  it.each(MEASURE2_SAFE_FR.map((t) => [t]))('safe fr: %s', (t) => {
    expect(validateCoachText(t, rulesFor('fr'))).toMatchObject({ ok: true });
  });
  it.each(MEASURE2_UNSAFE_ASKS.map((t) => [t]))('routes: %s', (t) => {
    expect(detectSupportSignal(t)).not.toBeNull();
  });
  it.each(MEASURE2_ORDINARY_ASKS.map((t) => [t]))('does not route: %s', (t) => {
    expect(detectSupportSignal(t)).toBeNull();
  });
});

describe('review fixtures: over-blocking found in review of the second pass', () => {
  it.each(REVIEW_SAFE_EN.map((t) => [t]))('safe en: %s', (t) => {
    expect(validateCoachText(t, rulesFor('en'))).toMatchObject({ ok: true });
  });
  it.each(REVIEW_SAFE_FR.map((t) => [t]))('safe fr: %s', (t) => {
    expect(validateCoachText(t, rulesFor('fr'))).toMatchObject({ ok: true });
  });
  it.each(REVIEW_ORDINARY_ASKS.map((t) => [t]))('does not route: %s', (t) => {
    expect(detectSupportSignal(t)).toBeNull();
  });
  it('still routes what the fixes must not reopen', () => {
    for (const t of [
      'I only had a coffee today, is that good for losing weight?',
      'I only had a coffee this morning, how do I lose weight faster?',
      'Is 1000 calories a day enough?',
      'How do I get rid of what I ate?',
      'Est-ce que 1 100 kcal par jour suffisent ?',
    ]) {
      expect(detectSupportSignal(t), t).not.toBeNull();
    }
  });
  it('still refuses the bare verdict forms of the moral words and the bare meal-count advice', () => {
    const r = rulesFor('en');
    for (const t of [
      'Great discipline, you barely ate today.',
      'Your willpower is impressive.',
      'You need more discipline with snacks.',
      'Two meals a day is plenty.',
      'A cup of tea can stand in for dinner.',
    ]) {
      expect(validateCoachText(t, r).ok, t).toBe(false);
    }
  });
});

describe('second pass of the lexical layer: the edges', () => {
  const guide = { floorKcal: 1200, guideKcal: 1700 };
  it('sums a meal list where only the last figure has the unit', () => {
    expect(hasUnsafeEnergyFigure('Breakfast 200, lunch 350, dinner 400 kcal.', guide)).toBe(true);
    expect(hasUnsafeEnergyFigure('Breakfast 500, lunch 600, dinner 700 kcal.', guide)).toBe(false);
    // What was logged is a description, not a plan.
    expect(
      hasUnsafeEnergyFigure('Yesterday you had breakfast 200, lunch 350, dinner 400 kcal.', guide),
    ).toBe(false);
  });
  it('refuses a deficit that takes the day under the floor, and any deficit over 750 kcal', () => {
    expect(hasUnsafeEnergyFigure('A deficit of 600 kcal below your guide.', guide)).toBe(true);
    expect(hasUnsafeEnergyFigure('A deficit of 500 kcal below your guide.', guide)).toBe(false);
    expect(hasUnsafeEnergyFigure('A deficit of 800 kcal below what you burn.', guide)).toBe(true);
    expect(hasUnsafeEnergyFigure('A deficit of 500 kcal below what you burn.', guide)).toBe(false);
  });
  it('lets a plan for a lighter meal through, but not a reaction to having eaten', () => {
    const r = rulesFor('en');
    expect(
      validateCoachText('Planning one lighter meal on Saturday might even that out.', r).ok,
    ).toBe(true);
    expect(
      validateCoachText('Yesterday was big, so make today lighter to even it out.', r).ok,
    ).toBe(false);
  });
  it('accepts negated and warning forms of the new patterns', () => {
    const r = rulesFor('en');
    for (const t of [
      'There is no need to fast.',
      'Never call wanting a snack weakness.',
      'Letting a meal go often backfires with stronger hunger later.',
    ]) {
      expect(validateCoachText(t, r)).toMatchObject({ ok: true });
    }
    const fr = rulesFor('fr');
    expect(validateCoachText('Ce n’est pas de la faiblesse de manger un dessert.', fr).ok).toBe(
      true,
    );
  });
  it('routes a figure at or under the floor in an ask without a "per day"', () => {
    expect(detectSupportSignal('Is 1000 calories enough?')).not.toBeNull();
    expect(detectSupportSignal('Ideas for a 500 kcal lunch?')).toBeNull();
  });
});
