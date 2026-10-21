/**
 * Typical portions for CIQUAL foods, by sub-group. CIQUAL lists composition per 100 g and no
 * portions, so these are round, household-style defaults (a piece of fruit, a slice of bread, a pot
 * of yogurt, a portion of cooked rice...); they are ESTIMATES (`gramsEstimated: true`) the person
 * can override with a weighed amount. Every food also gets "100 g".
 *
 * A portion is `[kind, grams]`; the kind picks the label wording ("Small portion · 100 g",
 * "1 portion · 150 g", "Large portion · 250 g") in `food-display.ts`.
 */

export type PortionKind = 'small' | 'portion' | 'large';
export type Portion = readonly [kind: PortionKind, grams: number];

const FRUIT: readonly Portion[] = [['portion', 150]];
const VEGETABLE: readonly Portion[] = [
  ['small', 100],
  ['large', 200],
];
const STARCH_COOKED: readonly Portion[] = [
  ['portion', 150],
  ['large', 250],
];
const MEAT_FISH: readonly Portion[] = [
  ['portion', 100],
  ['large', 150],
];
const EGG: readonly Portion[] = [
  ['portion', 55],
  ['large', 110],
];
const NUTS: readonly Portion[] = [['portion', 30]];
const CHEESE: readonly Portion[] = [['portion', 30]];
const YOGURT: readonly Portion[] = [['portion', 125]];
const MILK: readonly Portion[] = [['portion', 250]];
const CREAM: readonly Portion[] = [['portion', 30]];
const BREAD: readonly Portion[] = [['portion', 40]];
const CEREAL: readonly Portion[] = [['portion', 40]];
const SNACK: readonly Portion[] = [['portion', 30]];
const DRINK: readonly Portion[] = [['portion', 250]];
const FAT: readonly Portion[] = [['portion', 10]];
const SWEET: readonly Portion[] = [['portion', 20]];
const PASTRY: readonly Portion[] = [['portion', 50]];
const ICE_CREAM: readonly Portion[] = [['portion', 60]];
const SAUCE: readonly Portion[] = [['portion', 30]];
const CONDIMENT: readonly Portion[] = [['portion', 15]];
const SOUP: readonly Portion[] = [['portion', 250]];
const SALAD: readonly Portion[] = [['portion', 200]];
const SANDWICH: readonly Portion[] = [['portion', 200]];
const DISH: readonly Portion[] = [['portion', 300]];

/** Sub-group code -> typical portions. A sub-group not listed gets only "100 g". */
export const SUBGROUP_PORTIONS: Readonly<Record<string, readonly Portion[]>> = {
  '0101': SALAD,
  '0102': SOUP,
  '0103': DISH,
  '0104': DISH,
  '0105': SANDWICH,
  '0106': SNACK,
  '0201': VEGETABLE,
  '0202': STARCH_COOKED,
  '0203': STARCH_COOKED,
  '0204': FRUIT,
  '0205': NUTS,
  '0301': STARCH_COOKED,
  '0302': BREAD,
  '0303': SNACK,
  '0401': MEAT_FISH,
  '0402': MEAT_FISH,
  '0403': [['portion', 50]],
  '0404': MEAT_FISH,
  '0405': MEAT_FISH,
  '0406': MEAT_FISH,
  '0407': MEAT_FISH,
  '0408': MEAT_FISH,
  '0409': MEAT_FISH,
  '0410': EGG,
  '0411': MEAT_FISH,
  '0501': MILK,
  '0502': YOGURT,
  '0503': CHEESE,
  '0504': CREAM,
  '0601': DRINK,
  '0602': DRINK,
  '0603': [['portion', 125]],
  '0701': SWEET,
  '0702': SWEET,
  '0703': SWEET,
  '0704': CONDIMENT,
  '0705': PASTRY,
  '0706': PASTRY,
  '0707': CEREAL,
  '0708': SWEET,
  '0709': PASTRY,
  '0801': ICE_CREAM,
  '0802': ICE_CREAM,
  '0803': ICE_CREAM,
  '0901': FAT,
  '0902': FAT,
  '0903': FAT,
  '0904': FAT,
  '0905': FAT,
  '1001': SAUCE,
  '1002': CONDIMENT,
  '1003': CONDIMENT,
  '1009': MEAT_FISH,
  '1010': CONDIMENT,
};

/** The grams to offer in the "100 g" preset. */
export const PER_100_G = 100;

/** The typical portions of a CIQUAL food (possibly none: the caller always adds "100 g"). */
export function portionsFor(subgroupCode: string | undefined): readonly Portion[] {
  if (subgroupCode === undefined) return [];
  return Object.hasOwn(SUBGROUP_PORTIONS, subgroupCode)
    ? (SUBGROUP_PORTIONS[subgroupCode] ?? [])
    : [];
}
