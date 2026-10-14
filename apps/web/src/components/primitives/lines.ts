import { BALANCE_ARC_GROUPS } from '@anc/core';
import type { FoodEntry, FoodGroup, PlateLog } from '@anc/core';

/** The four food lines. `other` has no line. */
export type LineGroup = Exclude<FoodGroup, 'other'>;

export interface LineDef {
  readonly group: LineGroup;
  /**
   * Key of the line's name in `strings().groups`. The group id doubles as the i18n key; names are
   * spelled once ("Veg & fruit") and upper-cased only by CSS.
   */
  readonly nameKey: LineGroup;
  /** x position of the line in the 132px day-map lane. */
  readonly x: number;
  /** Literal class strings so Tailwind's scanner sees them. */
  readonly stroke: string;
  readonly bg: string;
}

const DEFS: Readonly<Record<LineGroup, Omit<LineDef, 'group' | 'nameKey'>>> = {
  vegFruit: { x: 30, stroke: 'stroke-line-veg', bg: 'bg-line-veg' },
  protein: { x: 54, stroke: 'stroke-line-protein', bg: 'bg-line-protein' },
  starch: { x: 78, stroke: 'stroke-line-starch', bg: 'bg-line-starch' },
  dairy: { x: 102, stroke: 'stroke-line-dairy', bg: 'bg-line-dairy' },
};

const isLine = (g: FoodGroup): g is LineGroup => g !== 'other';

/** The one list of lines, in map order (core's balance-arc order: veg, protein, starch, dairy). */
export const LINES: readonly LineDef[] = BALANCE_ARC_GROUPS.filter(isLine).map((group) => ({
  group,
  nameKey: group,
  ...DEFS[group],
}));

export const LINE_GROUPS: readonly LineGroup[] = LINES.map((l) => l.group);

/** The definition of one line. */
export const lineDef = (group: LineGroup): LineDef => LINES.find((l) => l.group === group)!;

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
