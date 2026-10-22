import { describe, expect, it } from 'vitest';
import { capitalise, fill, joinNames, plural, strings } from './index';
import { lineName, platesCount, stationLabel } from './sentences';

describe('i18n helpers', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });

  it('picks plural forms with Intl.PluralRules, honouring an explicit zero', () => {
    expect(platesCount(0)).toBe('No plates');
    expect(platesCount(1)).toBe('1 plate');
    expect(platesCount(3)).toBe('3 plates');
    expect(plural({ one: '{count} thing', other: '{count} things' }, 0)).toBe('0 things');
  });

  it('joins lists in prose', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['a'])).toBe('a');
    expect(joinNames(['a', 'b'])).toBe('a and b');
    expect(joinNames(['a', 'b', 'c'])).toBe('a, b and c');
    expect(capitalise('veg & fruit')).toBe('Veg & fruit');
  });

  it('spells food-group names once and lower-cases them mid-sentence', () => {
    expect(strings().groups.vegFruit).toBe('Veg & fruit');
    expect(lineName('vegFruit')).toBe('veg & fruit');
  });

  it('builds meal names from groups, never counts', () => {
    expect(
      stationLabel({ meal: 'Lunch', time: '12:55', present: ['protein'], passed: ['dairy'] }),
    ).toBe('Open Lunch, 12:55: protein on the plate. Without dairy');
    expect(stationLabel({ meal: 'Late', time: '22:00', present: [], passed: [] })).toBe(
      'Open Late, 22:00: no food group',
    );
  });
});
