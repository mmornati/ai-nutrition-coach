export const SOURCE_CATALOGS = ['off', 'usda', 'manual', 'seed'] as const;
export type SourceCatalog = (typeof SOURCE_CATALOGS)[number];

export const FOOD_GROUPS = ['vegFruit', 'protein', 'starch', 'dairy', 'other'] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

const FOOD_GROUP_LABELS: Readonly<Record<FoodGroup, string>> = {
  vegFruit: 'Veg & Fruit',
  protein: 'Protein',
  starch: 'Starch',
  dairy: 'Dairy',
  other: 'Other',
};

export function foodGroupLabel(group: FoodGroup): string {
  return FOOD_GROUP_LABELS[group];
}

/** Exact (trimmed) closed-enum names only; anything else is `null`. */
export function parseFoodGroup(raw: unknown): FoodGroup | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return FOOD_GROUPS.find((g) => g === trimmed) ?? null;
}

/** Unknown group names collapse to `other`; reading a stored row never throws. */
export function foodGroupFromStored(raw: unknown): FoodGroup {
  return parseFoodGroup(raw) ?? 'other';
}

/**
 * The food captured on an entry at log time. `sourceRef` is the verbatim external reference
 * (OFF barcode, USDA id, a manual label) and is stored byte-for-byte, never normalised.
 */
export interface DatabaseFood {
  readonly sourceRef: string;
  readonly displayName: string;
  readonly source: SourceCatalog;
  readonly foodGroup: FoodGroup;
}

export function databaseFood(input: {
  readonly sourceRef: string;
  readonly displayName: string;
  readonly source: SourceCatalog;
  readonly foodGroup?: FoodGroup;
}): DatabaseFood {
  return {
    sourceRef: input.sourceRef,
    displayName: input.displayName,
    source: input.source,
    foodGroup: input.foodGroup ?? 'other',
  };
}
