// Copy that describes what leaves the device must be true (docs/no-dark-patterns-standard.md).
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fr } from './fr';

describe('the weight-trend switch says what it does', () => {
  it('off: does not claim the coach sees nothing about the weight (the rounded guide derives from it)', () => {
    expect(en.ai.yourAi.trendHelpOff).not.toMatch(/never sees anything about your weight/i);
    expect(en.ai.yourAi.trendHelpOff).toMatch(/daily guide, rounded/);
    expect(en.ai.yourAi.trendHelpOff).toMatch(/weight and height/);
    expect(fr.ai.yourAi.trendHelpOff).not.toMatch(/ne voit rien de votre poids/i);
    expect(fr.ai.yourAi.trendHelpOff).toMatch(/repère quotidien, arrondi/);
  });
  it('on: says it is sent only while weight help is allowed', () => {
    expect(en.ai.yourAi.trendHelpOn).toMatch(/only while you have chosen to lose or gain weight/);
    expect(en.ai.yourAi.trendHelpOn).toMatch(/not held for safety/);
    expect(fr.ai.yourAi.trendHelpOn).toMatch(
      /que si vous avez choisi de perdre ou de prendre du poids/,
    );
  });
});
