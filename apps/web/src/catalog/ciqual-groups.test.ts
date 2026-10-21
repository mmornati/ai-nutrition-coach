import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CiqualTable } from './ciqual';
import { ciqualFoodGroup, GROUP_RULES, SUBGROUP_RULES } from './ciqual-groups';
import { SUBGROUP_PORTIONS } from './ciqual-portions';

const table = JSON.parse(
  readFileSync(join(__dirname, '../../public/catalog/ciqual-2025.json'), 'utf8'),
) as CiqualTable;

const group = (groupCode: string, subgroupCode: string | undefined, nameFr = 'x') =>
  ciqualFoodGroup({ groupCode, ...(subgroupCode ? { subgroupCode } : {}), nameFr });

describe('CIQUAL group mapping', () => {
  it('has a rule for every group and sub-group of the shipped table', () => {
    for (const code of Object.keys(table.subgroups))
      expect(SUBGROUP_RULES[code], code).toBeDefined();
    for (const code of Object.keys(table.groups)) expect(GROUP_RULES[code], code).toBeDefined();
    // No stale rule for a sub-group that no longer exists.
    for (const code of Object.keys(SUBGROUP_RULES))
      expect(table.subgroups[code], code).toBeDefined();
    for (const code of Object.keys(SUBGROUP_PORTIONS))
      expect(table.subgroups[code], code).toBeDefined();
  });

  it.each([
    ['0201', 'vegFruit'],
    ['0204', 'vegFruit'],
    ['0203', 'protein'],
    ['0205', 'protein'],
    ['0202', 'starch'],
    ['0301', 'starch'],
    ['0302', 'starch'],
    ['0401', 'protein'],
    ['0405', 'protein'],
    ['0410', 'protein'],
    ['0501', 'dairy'],
    ['0503', 'dairy'],
    ['0901', 'dairy'],
    ['0902', 'other'],
    ['0601', 'other'],
    ['0701', 'other'],
    ['0706', 'other'],
    ['0801', 'other'],
    ['1001', 'other'],
    ['1007', 'vegFruit'],
  ])('sub-group %s is %s', (sub, expected) => {
    expect(group(sub.slice(0, 2), sub)).toBe(expected);
  });

  it('files composite dishes by what the name says', () => {
    expect(group('01', '0103', 'Lasagnes à la bolognaise, préemballées')).toBe('starch');
    expect(group('01', '0104', 'Pizza au fromage')).not.toBe('other');
    expect(group('01', '0102', 'Soupe de légumes')).toBe('vegFruit');
    expect(group('01', '0103', 'Plat mystère')).toBe('other');
  });

  it('keeps drinks in other, except plant milks and the like', () => {
    expect(group('06', '0602', "Jus d'orange")).toBe('other');
    expect(group('06', '0602', "Boisson à l'avoine, nature")).toBe('dairy');
    expect(group('06', '0603', 'Vin rouge')).toBe('other');
  });

  it('falls back to the group, then to the name, for an unknown or missing sub-group', () => {
    expect(group('04', undefined)).toBe('protein');
    expect(group('04', '9999')).toBe('protein');
    expect(group('', undefined, 'Dessert (aliment moyen)')).toBe('other');
    expect(group('', undefined, 'Poulet rôti')).toBe('protein');
  });

  it('gives every food of the table one of the five groups', () => {
    const seen = new Set<string>();
    for (const [, nameFr, , groupCode, subgroupCode] of table.foods) {
      seen.add(
        ciqualFoodGroup({
          groupCode,
          ...(subgroupCode ? { subgroupCode } : {}),
          nameFr,
        }),
      );
    }
    expect([...seen].sort()).toEqual(['dairy', 'other', 'protein', 'starch', 'vegFruit']);
  });
});
