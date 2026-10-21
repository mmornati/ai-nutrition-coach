/**
 * Typed view of the generated CIQUAL table (`public/catalog/ciqual-<year>.json`, produced by
 * `tools/ciqual/build-ciqual.mjs`; source and licence in `tools/ciqual/README.md`). Not wired into
 * search yet. A value the table does not know is `null` in the file and ABSENT here, never zero.
 */

export const CIQUAL_NUTRIENT_KEYS = [
  'energyKcal',
  'protein',
  'carbohydrate',
  'sugars',
  'fat',
  'saturatedFat',
  'fibre',
  'salt',
] as const;

export type CiqualNutrientKey = (typeof CIQUAL_NUTRIENT_KEYS)[number];

/** Per-100 g values; a key is present only when CIQUAL has a value. */
export type CiqualPer100g = Partial<Record<CiqualNutrientKey, number>>;

/** One compact food row: code, FR name, EN name, group, sub-group ('' if none), then 8 values. */
export type CiqualRecord = readonly [
  code: string,
  nameFr: string,
  nameEn: string,
  groupCode: string,
  subgroupCode: string,
  ...values: (number | null)[],
];

export interface CiqualTable {
  version: string;
  revision: string;
  nutrients: readonly string[];
  /** group code -> [French name, English name] */
  groups: Readonly<Record<string, readonly [string, string]>>;
  subgroups: Readonly<Record<string, readonly [string, string]>>;
  foods: readonly CiqualRecord[];
}

export interface CiqualFood {
  code: string;
  nameFr: string;
  nameEn: string;
  /** '' when CIQUAL files the food under no group (a generic placeholder row). */
  groupCode: string;
  subgroupCode?: string;
  per100g: CiqualPer100g;
}

/** Maps a compact record to a food; throws when the record has the wrong shape. */
export function ciqualFood(record: CiqualRecord): CiqualFood {
  const [code, nameFr, nameEn, groupCode, subgroupCode, ...values] = record;
  if (values.length !== CIQUAL_NUTRIENT_KEYS.length) {
    throw new Error(`CIQUAL record ${code}: expected ${CIQUAL_NUTRIENT_KEYS.length} values`);
  }
  const per100g: CiqualPer100g = {};
  CIQUAL_NUTRIENT_KEYS.forEach((key, i) => {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) per100g[key] = v;
  });
  return {
    code,
    nameFr,
    nameEn,
    groupCode,
    ...(subgroupCode ? { subgroupCode } : {}),
    per100g,
  };
}

/** Maps a whole table; checks the nutrient order the file declares matches this module's. */
export function ciqualFoods(table: CiqualTable): CiqualFood[] {
  if (table.nutrients.join() !== CIQUAL_NUTRIENT_KEYS.join()) {
    throw new Error('CIQUAL table nutrient order does not match the loader');
  }
  return table.foods.map(ciqualFood);
}
