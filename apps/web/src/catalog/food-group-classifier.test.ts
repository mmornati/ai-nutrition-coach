// `classifyFoodGroup`: OFF category tags and food names. Ported one-to-one from
// packages/integrations/test/food_group_classifier_test.dart.
import { describe, expect, it } from 'vitest';
import { classifyFoodByName, classifyFoodGroup } from './food-group-classifier';
import { seedFoods } from './seed-foods';

describe('the reported misclassifications', () => {
  it('peanut butter is PROTEIN, not dairy (it contains "butter")', () => {
    expect(classifyFoodGroup(['Peanut butter'])).toBe('protein');
    expect(classifyFoodGroup(['en:spreads', 'en:nut-butters', 'en:peanut-butters'])).toBe(
      'protein',
    );
    expect(classifyFoodGroup(['almond butter'])).toBe('protein');
    expect(classifyFoodGroup(['tahini'])).toBe('protein');
  });

  it('plain butter is still dairy', () => {
    expect(classifyFoodGroup(['en:butters'])).toBe('dairy');
    expect(classifyFoodGroup(['Butter'])).toBe('dairy');
  });

  it('almond / oat / soy milk sit in the dairy quadrant (dairy alternative)', () => {
    expect(classifyFoodGroup(['Almond milk'])).toBe('dairy');
    expect(
      classifyFoodGroup(['en:plant-based-foods-and-beverages', 'en:nut-milks', 'en:almond-milks']),
    ).toBe('dairy');
    expect(classifyFoodGroup(['oat drink'])).toBe('dairy');
    expect(classifyFoodGroup(['en:soy-yogurts'])).toBe('dairy');
  });

  it('a generic plant-based tag does not hijack an almond milk', () => {
    // `en:plant-based-foods` carries no group; the milk tag decides.
    expect(classifyFoodGroup(['en:plant-based-foods', 'en:almond-milks'])).toBe('dairy');
  });
});

describe('whole-token matching', () => {
  it('eggplant is a vegetable, not an egg', () => {
    expect(classifyFoodGroup(['Eggplant'])).toBe('vegFruit');
    expect(classifyFoodGroup(['en:eggs'])).toBe('protein');
  });

  it('licorice is not rice, butterfly is not butter', () => {
    expect(classifyFoodGroup(['licorice'])).toBe('other');
    expect(classifyFoodGroup(['butterfly pasta'])).toBe('starch');
  });

  it('plural / language-prefixed OFF tags', () => {
    expect(classifyFoodGroup(['en:fruits', 'en:apples'])).toBe('vegFruit');
    expect(classifyFoodGroup(['en:dairy', 'en:yogurts'])).toBe('dairy');
    expect(classifyFoodGroup(['fr:berries'])).toBe('vegFruit');
    expect(classifyFoodGroup(['en:breads'])).toBe('starch');
    expect(classifyFoodGroup(['en:legumes'])).toBe('protein');
  });

  it('nothing recognisable is other, never a guess', () => {
    expect(classifyFoodGroup([])).toBe('other');
    expect(classifyFoodGroup(['en:spreads', 'en:sweet-spreads'])).toBe('other');
    expect(classifyFoodGroup(['Dark chocolate'])).toBe('other');
  });

  it('dairy wins over a fruit flavour', () => {
    expect(classifyFoodGroup(['strawberry yogurt'])).toBe('dairy');
  });
});

it('every seeded food classifies to its own group by name (or other)', () => {
  // The name classifier is a FALLBACK; it must never contradict the curated seed list (a wrong
  // group is worse than `other`).
  for (const seed of seedFoods) {
    // The curated `other` set (nuts, oils, chocolate) is a product choice the name classifier is
    // not asked to reproduce.
    if (seed.foodGroup === 'other') continue;
    const guessed = classifyFoodGroup([seed.displayName]);
    expect(
      guessed === seed.foodGroup || guessed === 'other',
      `${seed.displayName}: seed ${seed.foodGroup}, guessed ${guessed}`,
    ).toBe(true);
  }
});

describe('classifyFoodByName (the one-name adapter)', () => {
  it('classifies a whole name', () => {
    expect(classifyFoodByName('egg')).toBe('protein');
    expect(classifyFoodByName('rice')).toBe('starch');
    expect(classifyFoodByName('milk')).toBe('dairy');
    expect(classifyFoodByName('peanut butter')).toBe('protein');
  });

  it('a bare string cannot be passed to classifyFoodGroup (it would classify characters)', () => {
    const misuse = (): unknown =>
      // @ts-expect-error a string is an iterable of characters: the parameter is a readonly string[]
      classifyFoodGroup('egg');
    expect(typeof misuse).toBe('function'); // compile-time check only; never called
    expect(classifyFoodGroup(['egg'])).toBe(classifyFoodByName('egg'));
  });
});
