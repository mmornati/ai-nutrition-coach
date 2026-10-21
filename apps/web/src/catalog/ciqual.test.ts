import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ciqualFood, ciqualFoods, type CiqualTable } from './ciqual';

describe('ciqualFood', () => {
  it('leaves unknown nutrients absent, keeps real zeros', () => {
    const f = ciqualFood([
      '19041',
      'Lait',
      'Milk',
      '05',
      '0501',
      47.7,
      3.48,
      5,
      null,
      1.56,
      0,
      null,
      0,
    ]);
    expect(f.per100g).toEqual({
      energyKcal: 47.7,
      protein: 3.48,
      carbohydrate: 5,
      fat: 1.56,
      saturatedFat: 0,
      salt: 0,
    });
    expect('sugars' in f.per100g).toBe(false);
    expect(f.subgroupCode).toBe('0501');
  });
  it('omits an empty sub-group and rejects a short record', () => {
    expect(
      ciqualFood(['1', 'a', 'b', '05', '', null, null, null, null, null, null, null, null]),
    ).toEqual({
      code: '1',
      nameFr: 'a',
      nameEn: 'b',
      groupCode: '05',
      per100g: {},
    });
    expect(() => ciqualFood(['1', 'a', 'b', '05', '', 1])).toThrow(/expected 8/);
  });
});

describe('the shipped CIQUAL file', () => {
  const table = JSON.parse(
    readFileSync(join(__dirname, '../../public/catalog/ciqual-2025.json'), 'utf8'),
  ) as CiqualTable;
  it('loads, with the documented size and consistent groups', () => {
    const foods = ciqualFoods(table);
    expect(foods).toHaveLength(3484);
    for (const f of foods) {
      if (f.groupCode) expect(table.groups[f.groupCode], f.code).toBeDefined();
      if (f.subgroupCode) expect(table.subgroups[f.subgroupCode], f.code).toBeDefined();
    }
  });
  it('carries no URL (the build scan rejects unknown hosts)', () => {
    expect(JSON.stringify(table)).not.toMatch(/\/\/[\w.-]+\.[a-z]{2,}/i);
  });
});
