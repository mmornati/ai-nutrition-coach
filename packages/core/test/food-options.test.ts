import { describe, expect, it } from 'vitest';
import {
  decodeOptions,
  defaultSlotOptions,
  encodeOptions,
  foodNameConflicts,
  FOOD_SLOTS,
  NO_OPTION,
  optionAllowed,
  restrictionsOf,
  slotOptions,
  slotParams,
  type Profile,
} from '../src/index';

const p = (over: Profile): Profile => over;

describe('the diet and allergy limits of every food a note names', () => {
  it('an omnivore with no tags has every option', () => {
    expect(slotOptions('protein', undefined)).toEqual(['eggs', 'beans', 'tofu', 'fish']);
    expect(slotOptions('dairy', p({}))).toEqual(['yogurt', 'cheese']);
  });

  it('vegetarian drops fish; vegan also drops eggs and dairy', () => {
    expect(slotOptions('protein', p({ diet: 'vegetarian' }))).toEqual([
      'eggs',
      'beans',
      'tofu',
      'lentils',
    ]);
    expect(slotOptions('protein', p({ diet: 'vegan' }))).toEqual([
      'beans',
      'tofu',
      'lentils',
      'chickpeas',
    ]);
    expect(slotOptions('dairy', p({ diet: 'vegan' }))).toEqual([]);
    expect(slotOptions('protein', p({ diet: 'pescatarian' }))).toContain('fish');
  });

  it.each([
    ['milk allergy', 'dairy'],
    ['Lactose', 'dairy'],
    ['allergie au lait', 'dairy'],
    ['Produits laitiers', 'dairy'],
    ['egg', 'eggs'],
    ['Œufs', 'eggs'],
    ['fish', 'fish'],
    ['poisson', 'fish'],
    ['soy', 'tofu'],
    ['soja', 'tofu'],
    ['gluten', 'oats'],
    ['blé', 'wholegrainBread'],
    ['nuts', 'nuts'],
    ['fruits à coque', 'nuts'],
  ])('the tag "%s" removes %s from every slot', (tag, option) => {
    const profile = p({ allergies: [tag] });
    for (const slot of FOOD_SLOTS) {
      expect(slotOptions(slot, profile)).not.toContain(option);
    }
  });

  it('a tag that names no family still blocks an option with that word', () => {
    expect(slotOptions('pulses', p({ allergies: ['Lentilles'] }))).toEqual(['chickpeas', 'beans']);
    expect(slotOptions('protein', p({ allergies: ['pois chiche'] }))).not.toContain('chickpeas');
    // An unknown tag removes nothing.
    expect(slotOptions('protein', p({ allergies: ['kiwi'] }))).toEqual(
      slotOptions('protein', undefined),
    );
  });

  it('a nut allergy also blocks peanut-like foods', () => {
    const r = restrictionsOf(p({ allergies: ['tree nuts'] }));
    expect(r.families.has('nuts')).toBe(true);
    expect(r.families.has('peanut')).toBe(true);
    expect(optionAllowed('nuts', r)).toBe(false);
  });

  it('stores the options as ids and reads them back', () => {
    const params = slotParams(['protein', 'dairy'], p({ diet: 'vegan' }));
    expect(params).toEqual({ protein: 'beans.tofu.lentils.chickpeas', dairy: NO_OPTION });
    expect(decodeOptions(params['protein']!)).toEqual(['beans', 'tofu', 'lentils', 'chickpeas']);
    expect(decodeOptions(NO_OPTION)).toEqual([]);
    expect(decodeOptions('beans.mystery')).toEqual(['beans']);
    expect(encodeOptions([])).toBe(NO_OPTION);
    expect(defaultSlotOptions('protein')).toEqual(['eggs', 'beans', 'tofu', 'fish']);
  });

  it('a food the person logs is not offered back when it conflicts with a limit', () => {
    expect(foodNameConflicts('Yaourt nature', p({ allergies: ['lait'] }))).toBe(true);
    expect(foodNameConflicts('Greek yogurt', p({ diet: 'vegan' }))).toBe(true);
    expect(foodNameConflicts('Lentils, cooked', p({ diet: 'vegan' }))).toBe(false);
    expect(foodNameConflicts('Peanut butter', p({ allergies: ['arachide'] }))).toBe(true);
    expect(foodNameConflicts('Anything', undefined)).toBe(false);
  });
});
