import { describe, expect, it } from 'vitest';
import type { Profile } from '../src/entities/profile';
import {
  decodeOptions,
  FOOD_SLOTS,
  foodNameConflicts,
  PATTERN_SLOTS,
  restrictionsOf,
  slotOptions,
  slotParams,
  type FoodOptionId,
} from '../src/coach/food-options';

const profile = (diet: Profile['diet'], allergies: string[]): Profile =>
  ({
    ageBand: '30-49',
    sex: 'female',
    activity: 'moderate',
    goal: 'eatBetter',
    diet,
    allergies,
  }) as Profile;

const DAIRY: FoodOptionId[] = ['yogurt', 'cheese', 'milk'];
const GLUTEN: FoodOptionId[] = ['wholegrainBread', 'oats'];
const FISH: FoodOptionId[] = ['fish', 'tinnedFish'];
const PULSES: FoodOptionId[] = ['beans', 'lentils', 'chickpeas'];

/**
 * The odd forms a person types, and the options that MUST NOT be offered for each (an independent
 * oracle: written by hand, not read from the table under test).
 */
const TAGS: readonly (readonly [string[], FoodOptionId[]])[] = [
  [['Lactose'], DAIRY],
  [['lactose intolerance'], DAIRY],
  [['APLV'], DAIRY],
  [['PLV'], DAIRY],
  [['milk protein'], DAIRY],
  [["cow's milk protein"], DAIRY],
  [['lait de vache'], DAIRY],
  [['allergie aux protéines de lait de vache'], DAIRY],
  [['Eggs, milk'], [...DAIRY, 'eggs']],
  [['oeuf'], ['eggs']],
  [['œufs'], ['eggs']],
  [['fruits à coque'], ['nuts']],
  [['noix'], ['nuts']],
  [['tree nuts'], ['nuts']],
  [['arachides'], ['nuts']],
  [['peanut'], ['nuts']],
  [['peanuts'], ['nuts']],
  [['gluten-free'], GLUTEN],
  [['coeliac'], GLUTEN],
  [['wheat'], GLUTEN],
  [['avoine'], ['oats']],
  [['soja'], ['tofu']],
  [['soy'], ['tofu']],
  [['sea food'], FISH],
  [['poisson'], FISH],
  [['crustacés'], []],
  [['celery'], []],
  [['sesame'], []],
  [['pulses'], [...PULSES, 'tofu', 'nuts']],
  [['légumineuses'], [...PULSES, 'tofu', 'nuts']],
  [['legumes'], [...PULSES, 'tofu', 'nuts']],
  [['lentilles'], ['lentils']],
  [['pois chiches'], ['chickpeas']],
  [['haricots'], ['beans']],
  [
    ['milk', 'gluten', 'nuts', 'soy'],
    [...DAIRY, ...GLUTEN, 'nuts', 'tofu'],
  ],
];

const DIETS: readonly (readonly [Profile['diet'], FoodOptionId[]])[] = [
  ['omnivore', []],
  ['pescatarian', []],
  ['vegetarian', FISH],
  ['vegan', [...FISH, ...DAIRY, 'eggs']],
];

describe('template x diet x allergen matrix', () => {
  const patterns = Object.entries(PATTERN_SLOTS);
  it('covers every template that names a food slot', () => {
    expect(patterns.length).toBeGreaterThanOrEqual(7);
  });

  for (const [pattern, slots] of patterns) {
    for (const [diet, dietBlocked] of DIETS) {
      for (const [tags, tagBlocked] of TAGS) {
        it(`${pattern} / ${diet} / ${tags.join(' + ')}`, () => {
          const p = profile(diet, tags);
          const params = slotParams(slots, p);
          const blocked = new Set<FoodOptionId>([...dietBlocked, ...tagBlocked]);
          for (const slot of slots) {
            const offered = decodeOptions(params[slot] ?? '');
            expect(offered.filter((id) => blocked.has(id))).toEqual([]);
            expect(offered).toEqual(slotOptions(slot, p));
          }
        });
      }
    }
  }
});

describe('the overlap decisions', () => {
  it('a peanut tag blocks the mixed "nuts" option, and a nut tag blocks peanut', () => {
    expect(restrictionsOf(profile('omnivore', ['peanut'])).families.has('peanut')).toBe(true);
    expect(slotOptions('snack', profile('omnivore', ['peanut']))).not.toContain('nuts');
    expect(slotOptions('snack', profile('omnivore', ['almonds']))).not.toContain('nuts');
    expect(restrictionsOf(profile('omnivore', ['almonds'])).families.has('peanut')).toBe(true);
  });
  it('a legume tag also blocks soy and peanut; a soy tag does not block lentils', () => {
    const legume = restrictionsOf(profile('omnivore', ['pulses'])).families;
    expect(legume.has('legume') && legume.has('soy') && legume.has('peanut')).toBe(true);
    expect(slotOptions('pulses', profile('omnivore', ['soy']))).toContain('lentils');
    expect(slotOptions('pulses', profile('omnivore', ['peanut']))).toContain('lentils');
  });
  it('a tag that names no family blocks an option whose words contain it', () => {
    expect(slotOptions('fibre', profile('omnivore', ['complet']))).not.toContain('brownRice');
    expect(slotOptions('fibre', profile('omnivore', ['complet']))).not.toContain('wholegrainBread');
    expect(slotOptions('fibre', profile('omnivore', ['spain']))).toContain('wholegrainBread');
    expect(slotOptions('protein', profile('omnivore', ['kiwi']))).toEqual(
      slotOptions('protein', undefined),
    );
  });
  it('foods the person logged follow the same families', () => {
    for (const [name, tags] of [
      ['Hummus maison', ['pulses']],
      ['Houmous', ['légumineuses']],
      ['Beurre de cacahuète', ['arachides']],
      ['Peanut butter', ['tree nuts']],
      ['Yaourt nature', ['APLV']],
      ['Feta', ['lactose']],
    ] as const) {
      expect(foodNameConflicts(name, profile('omnivore', [...tags]))).toBe(
        name === 'Feta' ? false : true,
      );
    }
  });
  it('knows every slot', () => {
    for (const slot of FOOD_SLOTS) expect(slotOptions(slot, undefined).length).toBeGreaterThan(0);
  });
});
