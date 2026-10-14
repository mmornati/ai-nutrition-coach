import type { FoodEntry, PlateLog } from '@anc/core';
import type { LineGroup } from './strings';

export interface LineDef {
  readonly group: LineGroup;
  /** x position of the line in the 132px lane. */
  readonly x: number;
  /** Literal class strings so Tailwind's scanner sees them. */
  readonly stroke: string;
  readonly bg: string;
}

/** Map order per DESIGN.md: veg, protein, starch, dairy. */
export const LINES: readonly LineDef[] = [
  { group: 'vegFruit', x: 30, stroke: 'stroke-line-veg', bg: 'bg-line-veg' },
  { group: 'protein', x: 54, stroke: 'stroke-line-protein', bg: 'bg-line-protein' },
  { group: 'starch', x: 78, stroke: 'stroke-line-starch', bg: 'bg-line-starch' },
  { group: 'dairy', x: 102, stroke: 'stroke-line-dairy', bg: 'bg-line-dairy' },
];

export const LINE_GROUPS: readonly LineGroup[] = LINES.map((l) => l.group);

/** Lines that stopped, in line order. `other` has no line and is ignored. */
export function orderedGroups(groups: Iterable<string>): LineGroup[] {
  const set = new Set(groups);
  return LINE_GROUPS.filter((g) => set.has(g));
}

export const groupsOfEntries = (entries: readonly FoodEntry[]): LineGroup[] =>
  orderedGroups(entries.map((e) => e.databaseFood.foodGroup));

export const groupsOfPlate = (plate: PlateLog): LineGroup[] => groupsOfEntries(plate.entries);

export const passedGroups = (present: readonly LineGroup[]): LineGroup[] =>
  LINE_GROUPS.filter((g) => !present.includes(g));
