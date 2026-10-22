import { sanitizeNutrients, type Nutrients } from '../value-types/nutrients';

export const SOURCE_CATALOGS = ['off', 'usda', 'manual', 'seed', 'ciqual', 'recipe'] as const;
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
  /** A snapshot of the food's nutrients per 100 g at log time. Missing key = unknown. */
  readonly nutrientsPer100g?: Nutrients;
  /** Third-party product information (Open Food Facts), never a score of the person. */
  readonly extra?: FoodExtra;
}

export const NUTRISCORE_GRADES = ['a', 'b', 'c', 'd', 'e'] as const;
export const NOVA_GROUPS = [1, 2, 3, 4] as const;

export interface FoodExtra {
  readonly nutriscoreGrade?: (typeof NUTRISCORE_GRADES)[number];
  readonly novaGroup?: (typeof NOVA_GROUPS)[number];
  /** True when the per-100 g nutrients came from a model's estimate, not a database. */
  readonly nutrientsEstimated?: boolean;
  /**
   * A recipe's other food groups (each a real share of its weight), besides `foodGroup`, so a
   * stew with beans and vegetables counts for all the lines it carries. Never `other`.
   */
  readonly groups?: readonly FoodGroup[];
}

/** Keep only a valid Nutri-Score grade / NOVA group; `undefined` when neither survives. */
export function sanitizeFoodExtra(input: unknown): FoodExtra | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const raw = input as Record<string, unknown>;
  const grade = NUTRISCORE_GRADES.find((g) => g === raw['nutriscoreGrade']);
  const nova = NOVA_GROUPS.find((n) => n === raw['novaGroup']);
  const estimated = raw['nutrientsEstimated'] === true;
  const groups = Array.isArray(raw['groups'])
    ? [
        ...new Set(
          (raw['groups'] as unknown[])
            .map(parseFoodGroup)
            .filter((g): g is FoodGroup => g !== null && g !== 'other'),
        ),
      ]
    : [];
  if (grade === undefined && nova === undefined && !estimated && groups.length === 0) {
    return undefined;
  }
  return Object.freeze({
    ...(grade !== undefined ? { nutriscoreGrade: grade } : {}),
    ...(nova !== undefined ? { novaGroup: nova } : {}),
    ...(estimated ? { nutrientsEstimated: true } : {}),
    ...(groups.length > 0 ? { groups: Object.freeze(groups) } : {}),
  });
}

export function databaseFood(input: {
  readonly sourceRef: string;
  readonly displayName: string;
  readonly source: SourceCatalog;
  readonly foodGroup?: FoodGroup;
  readonly nutrientsPer100g?: unknown;
  readonly extra?: unknown;
}): DatabaseFood {
  const nutrientsPer100g = sanitizeNutrients(input.nutrientsPer100g);
  const extra = sanitizeFoodExtra(input.extra);
  return {
    sourceRef: input.sourceRef,
    displayName: input.displayName,
    source: input.source,
    foodGroup: input.foodGroup ?? 'other',
    ...(nutrientsPer100g ? { nutrientsPer100g } : {}),
    ...(extra ? { extra } : {}),
  };
}
