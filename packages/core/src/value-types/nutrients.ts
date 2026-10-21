export const NUTRIENT_KEYS = [
  'energyKcal',
  'protein',
  'carbohydrate',
  'sugars',
  'fat',
  'saturatedFat',
  'fibre',
  'salt',
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** Per 100 g (or per entry once scaled). A missing key means UNKNOWN, never zero. */
export type Nutrients = Readonly<Partial<Record<NutrientKey, number>>>;

/** Upper bound per 100 g: kcal (pure fat is about 900), grams for the rest. */
const CAPS: Readonly<Record<NutrientKey, number>> = {
  energyKcal: 900,
  protein: 100,
  carbohydrate: 100,
  sugars: 100,
  fat: 100,
  saturatedFat: 100,
  fibre: 100,
  salt: 100,
};

/**
 * EU Reference Intakes (Regulation 1169/2011) for an adult, per day: energy in kcal, the rest in
 * grams. Fibre has no EU reference intake; 25 g is the common dietary recommendation and is used
 * here as a reference only (docs/adr/0006).
 */
export const EU_REFERENCE_INTAKES: Required<Nutrients> = Object.freeze({
  energyKcal: 2000,
  fat: 70,
  saturatedFat: 20,
  carbohydrate: 260,
  sugars: 90,
  protein: 50,
  salt: 6,
  fibre: 25,
});

/**
 * Keep only the plausible keys of an untrusted value: finite, non-negative, within the cap;
 * sugars may not exceed carbohydrate nor saturated fat exceed fat (the sub-value is dropped).
 * `undefined` when nothing survives. Never invents a value: unknown stays absent.
 */
export function sanitizeNutrients(input: unknown): Nutrients | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const source = input as Record<string, unknown>;
  const out: Partial<Record<NutrientKey, number>> = {};
  for (const key of NUTRIENT_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= CAPS[key]) {
      out[key] = value;
    }
  }
  if (out.sugars !== undefined && out.carbohydrate !== undefined && out.sugars > out.carbohydrate) {
    delete out.sugars;
  }
  if (out.saturatedFat !== undefined && out.fat !== undefined && out.saturatedFat > out.fat) {
    delete out.saturatedFat;
  }
  return Object.keys(out).length > 0 ? Object.freeze(out) : undefined;
}
