import { BALANCE_ARC_GROUPS } from '@anc/core';
import type { FoodEntry, FoodGroup, PlateLog } from '@anc/core';

/** The four food groups, each with its dye. `other` has no dye. */
export type LineGroup = Exclude<FoodGroup, 'other'>;

export interface LineDef {
  readonly group: LineGroup;
  /** Literal class strings so Tailwind's scanner sees them. */
  readonly stroke: string;
  readonly fill: string;
  readonly bg: string;
}

const DEFS: Readonly<Record<LineGroup, Omit<LineDef, 'group'>>> = {
  vegFruit: { stroke: 'stroke-veg', fill: 'fill-veg', bg: 'bg-veg' },
  protein: { stroke: 'stroke-protein', fill: 'fill-protein', bg: 'bg-protein' },
  starch: { stroke: 'stroke-starch', fill: 'fill-starch', bg: 'bg-starch' },
  dairy: { stroke: 'stroke-dairy', fill: 'fill-dairy', bg: 'bg-dairy' },
};

const isLine = (g: FoodGroup): g is LineGroup => g !== 'other';

/** The one list of groups, in stripe order (core's balance-arc order: veg, protein, starch, dairy). */
export const LINES: readonly LineDef[] = BALANCE_ARC_GROUPS.filter(isLine).map((group) => ({
  group,
  ...DEFS[group],
}));

export const LINE_GROUPS: readonly LineGroup[] = LINES.map((l) => l.group);

/** The definition of one group's dye. */
export const lineDef = (group: LineGroup): LineDef => LINES.find((l) => l.group === group)!;

/** Groups present, in stripe order. `other` has no dye and is ignored. */
export function orderedGroups(groups: Iterable<string>): LineGroup[] {
  const set = new Set(groups);
  return LINE_GROUPS.filter((g) => set.has(g));
}

export const groupsOfEntries = (entries: readonly FoodEntry[]): LineGroup[] =>
  orderedGroups(entries.map((e) => e.databaseFood.foodGroup));

export const groupsOfPlate = (plate: PlateLog): LineGroup[] => groupsOfEntries(plate.entries);

export const passedGroups = (present: readonly LineGroup[]): LineGroup[] =>
  LINE_GROUPS.filter((g) => !present.includes(g));
