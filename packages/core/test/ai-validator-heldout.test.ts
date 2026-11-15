import { describe, expect, it } from 'vitest';
import { detectSupportSignal, validateCoachText, type CoachTextRules } from '../src/index';
import {
  HELD_HARMFUL_EN,
  HELD_HARMFUL_FR,
  HELD_ORDINARY_ASKS,
  HELD_SAFE_EN,
  HELD_SAFE_FR,
  HELD_UNSAFE_ASKS,
} from './ai-validator-heldout';

const rulesFor = (locale: 'en' | 'fr'): CoachTextRules => ({
  maxChars: 800,
  numbersOn: true,
  maxQuestions: 2,
  locale,
  weightTalk: 'allowed',
  floorKcal: 1200,
  guideKcal: 1700,
});

// The held-out table was scored BEFORE tuning (see the change notes); after tuning every row is
// asserted, so it is a regression table from here on, no longer an unbiased measure.
describe('held-out sentences', () => {
  it('has 40 sentences per verdict and language, and 20 asks of each kind', () => {
    for (const list of [HELD_HARMFUL_EN, HELD_HARMFUL_FR, HELD_SAFE_EN, HELD_SAFE_FR]) {
      expect(list).toHaveLength(40);
    }
    expect(HELD_UNSAFE_ASKS).toHaveLength(20);
    expect(HELD_ORDINARY_ASKS).toHaveLength(20);
  });
  it.each(HELD_HARMFUL_EN.map((t) => [t]))('harmful en: %s', (t) => {
    expect(validateCoachText(t, rulesFor('en')).ok).toBe(false);
  });
  it.each(HELD_HARMFUL_FR.map((t) => [t]))('harmful fr: %s', (t) => {
    expect(validateCoachText(t, rulesFor('fr')).ok).toBe(false);
  });
  it.each(HELD_SAFE_EN.map((t) => [t]))('safe en: %s', (t) => {
    expect(validateCoachText(t, rulesFor('en'))).toMatchObject({ ok: true });
  });
  it.each(HELD_SAFE_FR.map((t) => [t]))('safe fr: %s', (t) => {
    expect(validateCoachText(t, rulesFor('fr'))).toMatchObject({ ok: true });
  });
  it.each(HELD_UNSAFE_ASKS.map((t) => [t]))('routes: %s', (t) => {
    expect(detectSupportSignal(t)).not.toBeNull();
  });
  it.each(HELD_ORDINARY_ASKS.map((t) => [t]))('does not route: %s', (t) => {
    expect(detectSupportSignal(t)).toBeNull();
  });
});
