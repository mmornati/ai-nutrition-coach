import { describe, expect, it } from 'vitest';
import { strings } from '../../i18n';
import { LINES, LINE_GROUPS, groupsOfEntries, lineDef, orderedGroups, passedGroups } from './lines';

describe('LINES', () => {
  it('lists the four lines in map order with distinct lanes and token classes', () => {
    expect(LINE_GROUPS).toEqual(['vegFruit', 'protein', 'starch', 'dairy']);
    expect(LINES.map((l) => l.bg)).toEqual(['bg-veg', 'bg-protein', 'bg-starch', 'bg-dairy']);
    expect(lineDef('starch').stroke).toBe('stroke-starch');
  });

  it('takes every line name from i18n, spelled once, upper-cased only by CSS', () => {
    const names = LINES.map((l) => strings().groups[l.group]);
    expect(names).toEqual(['Veg & fruit', 'Protein', 'Starch', 'Dairy']);
    for (const n of names) expect(n).not.toBe(n.toUpperCase());
  });

  it('orders groups in line order and ignores other', () => {
    expect(orderedGroups(['dairy', 'other', 'vegFruit'])).toEqual(['vegFruit', 'dairy']);
    expect(groupsOfEntries([])).toEqual([]);
    expect(passedGroups(['protein'])).toEqual(['vegFruit', 'starch', 'dairy']);
  });
});
