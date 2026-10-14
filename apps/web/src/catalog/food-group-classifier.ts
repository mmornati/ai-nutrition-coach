/**
 * Best-effort `FoodGroup` classification from descriptive text. Port of
 * the earlier client.
 *
 * Used in two places, which is why it lives on its own:
 *  - the barcode path classifies Open Food Facts `categories_tags` (`en:almond-milks`, ...);
 *  - the photo path falls back to it when a model's food has no valid `group` (the model's group
 *    is validated against the closed `FoodGroup` enum first), classifying the food NAME. Phase 6
 *    imports it from `src/catalog` and injects it; this module imports nothing from `src/ai`.
 *
 * Matching is on whole tokens (lowercased, `xx:` language prefix removed, non-alphanumerics treated
 * as spaces, simple plural stemming), not substrings, so `eggplant` is not an egg, `licorice` is
 * not rice and `butterfly` is not butter. Two overrides run before the generic keyword scan
 * because the generic words mislead:
 *
 *  - nut / seed butters (`peanut butter`, `almond butter`, `tahini`) are PROTEIN, not dairy;
 *  - plant milks and dairy substitutes (`almond milk`, `oat drink`, `soy yogurt`) sit in the DAIRY
 *    quadrant: the arc's quadrant is the "milk and its alternatives" slot, and "milk" is how the
 *    person thinks of it. (Documented, deliberate: no group is the honest "other" for them.)
 *
 * Anything that matches nothing is `other`: never a guess. Pure TypeScript.
 */
import type { FoodGroup } from '@anc/core';

/**
 * Classify `descriptors` (OFF category tags, or a single food name). The first descriptor that
 * classifies wins, after the two override passes.
 *
 * Takes a `readonly string[]`, NOT an `Iterable<string>`: a bare string is an iterable of
 * characters, so `classifyFoodGroup('egg')` would compile and classify `e`, `g`, `g`. To classify
 * one food name use {@link classifyFoodByName}.
 */
export function classifyFoodGroup(descriptors: readonly string[]): FoodGroup {
  const normalized = descriptors.map((d) => tokens(d));
  for (const t of normalized) if (isNutButter(t)) return 'protein';
  for (const t of normalized) if (isPlantMilk(t)) return 'dairy';
  for (const t of normalized) {
    const group = classifyTokens(t);
    if (group !== 'other') return group;
  }
  return 'other';
}

/** Classify ONE food name (the AI fallback's `ClassifyFoodGroup`). */
export function classifyFoodByName(name: string): FoodGroup {
  return classifyFoodGroup([name]);
}

function tokens(raw: string): string[] {
  let text = raw.toLowerCase().trim();
  // `en:almond-milks` -> `almond-milks`
  const colon = text.indexOf(':');
  if (colon >= 0 && colon <= 3) text = text.slice(colon + 1);
  return text
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
    .map(singular);
}

function singular(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

const NUT_WORDS: ReadonlySet<string> = new Set([
  'peanut',
  'almond',
  'cashew',
  'hazelnut',
  'walnut',
  'pistachio',
  'pecan',
  'nut',
  'seed',
  'sesame',
  'sunflower',
]);

function isNutButter(ts: readonly string[]): boolean {
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i] as string;
    if (t === 'tahini') return true;
    if (t === 'butter' && i > 0 && NUT_WORDS.has(ts[i - 1] as string)) return true;
    if (t === 'spread' && i > 0 && NUT_WORDS.has(ts[i - 1] as string)) return true;
  }
  return false;
}

const PLANT_WORDS: ReadonlySet<string> = new Set([
  'almond',
  'soy',
  'soya',
  'soja',
  'oat',
  'rice',
  'coconut',
  'hazelnut',
  'cashew',
  'nut',
  'pea',
  'plant',
  'vegetable',
  'vegan',
]);

function isPlantMilk(ts: readonly string[]): boolean {
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i] as string;
    if ((t === 'substitute' || t === 'alternative') && i > 0) {
      const prev = ts[i - 1];
      if (prev === 'dairy' || prev === 'milk') return true;
    }
    if (t === 'non' && i + 1 < ts.length && ts[i + 1] === 'dairy') return true;
    const isMilkWord = t === 'milk' || t === 'drink' || t === 'yogurt' || t === 'yoghurt';
    if (isMilkWord && i > 0) {
      // `almond milk`, `plant based milk`, `oat drink`, `soy yogurt`
      for (let j = 0; j < i; j++) if (PLANT_WORDS.has(ts[j] as string)) return true;
    }
  }
  return false;
}

const DAIRY: ReadonlySet<string> = new Set([
  'milk',
  'cheese',
  'yogurt',
  'yoghurt',
  'dairy',
  'butter',
  'cream',
  'kefir',
]);
const PROTEIN: ReadonlySet<string> = new Set([
  'meat',
  'fish',
  'seafood',
  'poultry',
  'legume',
  'pulse',
  'nut',
  'peanut',
  'egg',
  'tofu',
  'beef',
  'pork',
  'chicken',
  'turkey',
  'lamb',
  'ham',
  'sausage',
  'salmon',
  'tuna',
  'shrimp',
  'lentil',
  'chickpea',
  'bean',
  'tempeh',
]);
const STARCH: ReadonlySet<string> = new Set([
  'cereal',
  'pasta',
  'rice',
  'bread',
  'potato',
  'starch',
  'grain',
  'flour',
  'oat',
  'quinoa',
  'noodle',
  'tortilla',
  'couscous',
  'bagel',
]);
const VEG_FRUIT: ReadonlySet<string> = new Set([
  'vegetable',
  'fruit',
  'salad',
  'berry',
  'eggplant',
  'aubergine',
  'apple',
  'banana',
  'orange',
  'tomato',
  'carrot',
  'spinach',
  'broccoli',
  'cucumber',
  'lettuce',
  'onion',
  'pepper',
  'grape',
  'pear',
  'peach',
  'mango',
  'lemon',
  'avocado',
]);

function classifyTokens(ts: readonly string[]): FoodGroup {
  const any = (words: ReadonlySet<string>): boolean => ts.some((t) => words.has(t));
  // `eggplant` is one token, so `egg` never matches it. Order: the group a word is MOST
  // specifically about first: dairy beats a fruit flavour ("fruit yogurt"), starch beats a
  // vegetable adjective.
  if (any(DAIRY)) return 'dairy';
  if (any(PROTEIN)) return 'protein';
  if (any(STARCH)) return 'starch';
  if (any(VEG_FRUIT)) return 'vegFruit';
  return 'other';
}
