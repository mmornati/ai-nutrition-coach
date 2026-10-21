/**
 * CIQUAL group / sub-group -> the app's five food groups.
 *
 * Table-driven: the sub-group code (4 digits, e.g. `0204` fruits) is looked up first, then the
 * group code (2 digits), then the food NAME is classified. A rule is either a `FoodGroup` or:
 *  - `name`: composite dishes (starters, mixed dishes, pizzas, sandwiches, soups, baby meals) have no
 *    single group, so the French name goes through `classifyFoodByName` (which also handles mixed
 *    dishes such as "Lasagnes"); an unclassified name is `other`;
 *  - `nameDairyOnly`: drinks are `other`, except plant "milks" and drinks that the name classifier
 *    files as dairy (the same documented choice as for plant milks elsewhere).
 *
 * Choices worth knowing: legumes and nuts/seeds are `protein` (as the name classifier files nut
 * butters), pulses sit in the protein group not starch; potatoes and other tubers are `starch`;
 * butter is `dairy` (as the seed "Butter"), other fats and oils, sugary products, drinks, sauces,
 * spices, pastries and ice cream are `other`; breakfast cereals are `starch`; seaweed and herbs are
 * `vegFruit`.
 */
import type { FoodGroup } from '@anc/core';
import { classifyFoodByName } from './food-group-classifier';

export type GroupRule = FoodGroup | 'name' | 'nameDairyOnly';

/** Sub-group code -> rule. Every sub-group of the 2025 table is listed (a test checks it). */
export const SUBGROUP_RULES: Readonly<Record<string, GroupRule>> = {
  // 01 starters and composite dishes
  '0101': 'name',
  '0102': 'name',
  '0103': 'name',
  '0104': 'name',
  '0105': 'name',
  '0106': 'name',
  // 02 fruit, vegetables, legumes, nuts
  '0201': 'vegFruit',
  '0202': 'starch',
  '0203': 'protein',
  '0204': 'vegFruit',
  '0205': 'protein',
  // 03 cereal products
  '0301': 'starch',
  '0302': 'starch',
  '0303': 'other',
  '0304': 'starch',
  '0305': 'other',
  // 04 meat, eggs, fish
  '0401': 'protein',
  '0402': 'protein',
  '0403': 'protein',
  '0404': 'protein',
  '0405': 'protein',
  '0406': 'protein',
  '0407': 'protein',
  '0408': 'protein',
  '0409': 'protein',
  '0410': 'protein',
  '0411': 'protein',
  // 05 dairy
  '0501': 'dairy',
  '0502': 'dairy',
  '0503': 'dairy',
  '0504': 'dairy',
  // 06 drinks
  '0601': 'other',
  '0602': 'nameDairyOnly',
  '0603': 'other',
  // 07 sugary products
  '0701': 'other',
  '0702': 'other',
  '0703': 'other',
  '0704': 'other',
  '0705': 'other',
  '0706': 'other',
  '0707': 'starch',
  '0708': 'other',
  '0709': 'other',
  // 08 ice cream
  '0801': 'other',
  '0802': 'other',
  '0803': 'other',
  // 09 fats
  '0901': 'dairy',
  '0902': 'other',
  '0903': 'other',
  '0904': 'other',
  '0905': 'other',
  // 10 miscellaneous
  '1001': 'other',
  '1002': 'other',
  '1003': 'other',
  '1004': 'other',
  '1005': 'other',
  '1006': 'vegFruit',
  '1007': 'vegFruit',
  '1008': 'other',
  '1009': 'protein',
  '1010': 'other',
  // 11 baby food
  '1101': 'dairy',
  '1102': 'name',
  '1103': 'other',
  '1104': 'starch',
};

/** Group code -> rule, for a food with no (known) sub-group. */
export const GROUP_RULES: Readonly<Record<string, GroupRule>> = {
  '01': 'name',
  '02': 'name',
  '03': 'starch',
  '04': 'protein',
  '05': 'dairy',
  '06': 'nameDairyOnly',
  '07': 'other',
  '08': 'other',
  '09': 'other',
  '10': 'other',
  '11': 'name',
};

/** The app's group for a CIQUAL food. Pure; `nameFr` is only read by the name-based rules. */
export function ciqualFoodGroup(food: {
  readonly groupCode: string;
  readonly subgroupCode?: string;
  readonly nameFr: string;
}): FoodGroup {
  const rule =
    (food.subgroupCode !== undefined ? SUBGROUP_RULES[food.subgroupCode] : undefined) ??
    GROUP_RULES[food.groupCode] ??
    'name';
  switch (rule) {
    case 'name':
      return classifyFoodByName(food.nameFr);
    case 'nameDairyOnly':
      return classifyFoodByName(food.nameFr) === 'dairy' ? 'dairy' : 'other';
    default:
      return rule;
  }
}
