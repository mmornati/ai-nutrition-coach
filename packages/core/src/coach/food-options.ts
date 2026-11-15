/**
 * The foods a coach suggestion may name, and the rules that keep them inside the person's diet and
 * allergies (docs/adr/0008, docs/guide/coach.md).
 *
 * A coach template never hard-codes a food. It names a SLOT ("protein", "dairy", "fibre", ...) and
 * the slot is filled from the options this table allows for the person: the diet (vegetarian,
 * vegan, pescatarian) and every free-text allergy tag, matched without case or accents. The chosen
 * option ids ride in the note's stored key (`?protein=eggs.beans`), so a note reads the same later
 * and in the other language; the interface turns an id into a word in its own language.
 *
 * THE FAMILY TABLE (small on purpose; every entry is a family a person may say in a tag):
 *   meat       chicken, beef, pork, ham, ...                 blocked by vegetarian, vegan
 *   fish       fish and tinned fish                           blocked by vegetarian, vegan
 *   shellfish  prawns, crab, mussels, ...                     blocked by vegetarian, vegan
 *   dairy      milk, yogurt, cheese, butter, cream, lactose   blocked by vegan
 *   egg        eggs                                           blocked by vegan
 *   nuts       almonds, hazelnuts, walnuts, ...               (a nut allergy also blocks peanut)
 *   peanut     peanuts and peanut butter
 *   legume     pulses: lentils, chickpeas, dried beans, peas   (a legume tag also blocks soy and peanut)
 *   gluten     wheat, bread, pasta, oats (oats are often cross-contaminated), rye, barley
 *   soy        soy, tofu
 *
 * DECISIONS ON OVERLAPS. Soy and peanut ARE legumes, so a legume tag ("pulses", "légumineuses",
 * "legumes") blocks the legume foods AND soy AND peanut; but a soy tag blocks soy only (a person
 * allergic to soy is not told to avoid lentils) and a peanut tag blocks peanut only, plus the
 * "nuts" option, because that option is a mixed handful that may contain peanuts. A tree-nut tag
 * blocks peanut too (cross-reactive for many people). The "nuts" option therefore carries both
 * families, so either tag blocks it.
 *
 * A tag that names no family ("kiwi", "sesame", "lentils") still blocks any option whose own words
 * contain it, so a person's own words are respected even when the table does not know them.
 * When every option of a slot is blocked the slot is filled with a neutral phrase instead.
 */
import type { Diet, Profile } from '../entities/profile';

export const FOOD_FAMILIES = [
  'meat',
  'fish',
  'shellfish',
  'dairy',
  'egg',
  'nuts',
  'peanut',
  'gluten',
  'soy',
  'legume',
] as const;
export type FoodFamily = (typeof FOOD_FAMILIES)[number];

/** The ids a suggestion may name. The interface owns the words (`coachFoods` in the catalogues). */
export const FOOD_OPTION_IDS = [
  'eggs',
  'beans',
  'lentils',
  'chickpeas',
  'tofu',
  'fish',
  'tinnedFish',
  'yogurt',
  'cheese',
  'milk',
  'nuts',
  'fruit',
  'oats',
  'wholegrainBread',
  'brownRice',
] as const;
export type FoodOptionId = (typeof FOOD_OPTION_IDS)[number];

interface OptionDef {
  readonly families: readonly FoodFamily[];
  /** Folded words (English and French) a person's own tag is matched against. */
  readonly terms: readonly string[];
}

const OPTIONS: Readonly<Record<FoodOptionId, OptionDef>> = {
  eggs: { families: ['egg'], terms: ['egg', 'oeuf'] },
  beans: { families: ['legume'], terms: ['bean', 'haricot'] },
  lentils: { families: ['legume'], terms: ['lentil', 'lentille'] },
  chickpeas: { families: ['legume'], terms: ['chickpea', 'pois chiche', 'garbanzo'] },
  tofu: { families: ['soy'], terms: ['tofu', 'soy', 'soja'] },
  fish: { families: ['fish'], terms: ['fish', 'poisson'] },
  tinnedFish: {
    families: ['fish'],
    terms: [
      'fish',
      'poisson',
      'sardine',
      'tuna',
      'thon',
      'mackerel',
      'maquereau',
      'tinned',
      'boite',
    ],
  },
  yogurt: { families: ['dairy'], terms: ['yogurt', 'yoghurt', 'yaourt'] },
  cheese: { families: ['dairy'], terms: ['cheese', 'fromage'] },
  milk: { families: ['dairy'], terms: ['milk', 'lait'] },
  // A mixed handful may hold peanuts: a peanut tag blocks it as well as a tree-nut tag.
  nuts: {
    families: ['nuts', 'peanut'],
    terms: [
      'nut',
      'noix',
      'amande',
      'almond',
      'noisette',
      'hazelnut',
      'walnut',
      'cashew',
      'cajou',
      'pistache',
      'pistachio',
      'peanut',
      'cacahuete',
      'arachide',
    ],
  },
  fruit: { families: [], terms: ['fruit'] },
  oats: { families: ['gluten'], terms: ['oat', 'avoine', 'flocon', 'porridge'] },
  wholegrainBread: {
    families: ['gluten'],
    terms: ['bread', 'pain', 'wheat', 'ble', 'gluten', 'wholegrain', 'complet', 'toast'],
  },
  brownRice: { families: [], terms: ['rice', 'riz', 'brown', 'complet'] },
};

/** The slots a template may use, each an ordered pool (best first). */
export const FOOD_SLOTS = [
  'protein',
  'dairy',
  'fibre',
  'snack',
  'breakfast',
  'sweet',
  'pulses',
  'wholegrain',
] as const;
export type FoodSlot = (typeof FOOD_SLOTS)[number];

const POOLS: Readonly<Record<FoodSlot, readonly FoodOptionId[]>> = {
  protein: ['eggs', 'beans', 'tofu', 'fish', 'lentils', 'chickpeas', 'tinnedFish'],
  dairy: ['yogurt', 'cheese', 'milk'],
  fibre: ['beans', 'wholegrainBread', 'fruit', 'oats', 'lentils', 'chickpeas', 'nuts', 'brownRice'],
  snack: ['fruit', 'milk', 'yogurt', 'nuts'],
  breakfast: ['eggs', 'yogurt', 'nuts', 'fruit', 'tofu'],
  sweet: ['fruit', 'yogurt', 'nuts'],
  pulses: ['lentils', 'chickpeas', 'beans'],
  wholegrain: ['wholegrainBread', 'brownRice', 'oats'],
};

/** How many options a slot names at most (a sentence, not a list). */
const SLOT_SIZE: Readonly<Record<FoodSlot, number>> = {
  protein: 4,
  dairy: 2,
  fibre: 3,
  snack: 2,
  breakfast: 3,
  sweet: 2,
  pulses: 3,
  wholegrain: 3,
};

export const isFoodSlot = (value: string): value is FoodSlot =>
  (FOOD_SLOTS as readonly string[]).includes(value);

/** The default options of a slot when a stored note carries none (older notes): the plain pool. */
export function defaultSlotOptions(slot: FoodSlot): readonly FoodOptionId[] {
  return POOLS[slot].slice(0, SLOT_SIZE[slot]);
}

const PARAM_SEPARATOR = '.';

/** The stored form of the chosen options: `eggs.beans`, or `none` when every option is blocked. */
export const NO_OPTION = 'none';

export function encodeOptions(ids: readonly FoodOptionId[]): string {
  return ids.length === 0 ? NO_OPTION : ids.join(PARAM_SEPARATOR);
}

/** The ids a stored slot value names; unknown ids are dropped. `none` and `''` are empty. */
export function decodeOptions(value: string): readonly FoodOptionId[] {
  return value
    .split(PARAM_SEPARATOR)
    .filter((id): id is FoodOptionId => (FOOD_OPTION_IDS as readonly string[]).includes(id));
}

// ---------------------------------------------------------------------------------------------
// The person's restrictions
// ---------------------------------------------------------------------------------------------

/** Lower-case, accents removed, apostrophes straightened, other punctuation as spaces. */
export function foldWords(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Allergy words -> the families they block. Folded; matched as the start of a word of the tag, so
 * "milk allergy", "Lactose", "lait de vache" and "produits laitiers" all land on dairy.
 */
const ALLERGY_WORDS: Readonly<Record<FoodFamily, readonly string[]>> = {
  dairy: [
    'milk',
    'dairy',
    'lactose',
    'lait',
    'laitier',
    'laitiers',
    'fromage',
    'cheese',
    'casein',
    // French abbreviations: allergie aux protéines de lait de vache.
    'aplv',
    'plv',
  ],
  egg: ['egg', 'oeuf'],
  fish: ['fish', 'poisson', 'seafood', 'sea food', 'fruits de mer'],
  shellfish: [
    'shellfish',
    'crustace',
    'crustaces',
    'crevette',
    'shrimp',
    'prawn',
    'crab',
    'crabe',
    'lobster',
    'homard',
    'mollusque',
    'mollusc',
    'seafood',
    'sea food',
    'fruits de mer',
  ],
  nuts: [
    'nut',
    'nuts',
    'noix',
    'tree nut',
    'fruits a coque',
    'fruit a coque',
    'amande',
    'almond',
    'noisette',
    'hazelnut',
    'cashew',
    'pistache',
    'pistachio',
  ],
  peanut: ['peanut', 'arachide', 'cacahuete'],
  gluten: [
    'gluten',
    'wheat',
    'ble',
    'seigle',
    'rye',
    'barley',
    'orge',
    'coeliac',
    'celiac',
    'cœliaque',
  ],
  soy: ['soy', 'soya', 'soja', 'edamame', 'tofu', 'tempeh', 'miso'],
  // Only the GENERIC words name the family. A specific tag ("lentilles", "pois chiches") blocks the
  // options that carry that word (see `wordMatches`), not the whole family.
  legume: [
    'pulse',
    'pulses',
    'legume',
    'legumes',
    'legumineuse',
    'legumineuses',
    'legumin',
    'haricot sec',
    'haricots secs',
    'dried bean',
    'dried beans',
  ],
  meat: [],
};

const DIET_BLOCKS: Readonly<Record<Diet, readonly FoodFamily[]>> = {
  omnivore: [],
  pescatarian: ['meat'],
  vegetarian: ['meat', 'fish', 'shellfish'],
  vegan: ['meat', 'fish', 'shellfish', 'dairy', 'egg'],
};

export interface FoodRestrictions {
  readonly families: ReadonlySet<FoodFamily>;
  /** Folded tags that name no family: matched against an option's own words. */
  readonly words: readonly string[];
}

const NO_RESTRICTIONS: FoodRestrictions = { families: new Set(), words: [] };

function tagFamilies(foldedTag: string): FoodFamily[] {
  const out: FoodFamily[] = [];
  const padded = ` ${foldedTag} `;
  for (const family of FOOD_FAMILIES) {
    if (ALLERGY_WORDS[family].some((w) => padded.includes(` ${foldWords(w)}`))) out.push(family);
  }
  // A tree-nut allergy is cross-reactive with peanuts for many people: block both (conservative).
  if (out.includes('nuts') && !out.includes('peanut')) out.push('peanut');
  // Soy and peanut are legumes: a legume tag blocks them too (the other way round it does not).
  if (out.includes('legume')) {
    if (!out.includes('soy')) out.push('soy');
    if (!out.includes('peanut')) out.push('peanut');
  }
  return out;
}

/** What a profile rules out: its diet's families, its allergy tags' families, and the tag words. */
export function restrictionsOf(profile: Profile | undefined): FoodRestrictions {
  if (profile === undefined) return NO_RESTRICTIONS;
  const families = new Set<FoodFamily>(DIET_BLOCKS[profile.diet ?? 'omnivore']);
  const words: string[] = [];
  for (const raw of profile.allergies ?? []) {
    const tag = foldWords(raw);
    if (tag === '') continue;
    const found = tagFamilies(tag);
    for (const f of found) families.add(f);
    if (found.length === 0 && tag.length >= 3) words.push(tag);
  }
  return { families, words };
}

const stemWord = (w: string): string =>
  w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;

/**
 * A tag that names no family matches an option's words by whole words (a plural `s` ignored), or by
 * a word that starts with the other when it is at least four letters long ("lentils" / "lentil",
 * "haricots" / "haricot"), so "spain" never blocks "pain" and "table" never blocks "ble".
 */
const wordMatches = (tag: string, term: string): boolean => {
  const tagWords = tag.split(' ').map(stemWord);
  const termWords = term.split(' ').map(stemWord);
  return tagWords.some((t) =>
    termWords.some(
      (m) => t === m || (t.length >= 4 && m.startsWith(t)) || (m.length >= 4 && t.startsWith(m)),
    ),
  );
};

/** Whether an option is allowed under the restrictions. */
export function optionAllowed(id: FoodOptionId, restrictions: FoodRestrictions): boolean {
  const def = OPTIONS[id];
  if (def.families.some((f) => restrictions.families.has(f))) return false;
  return !restrictions.words.some((tag) => def.terms.some((term) => wordMatches(tag, term)));
}

/** The options of a slot the person may be offered, best first, at most the slot's size. */
export function slotOptions(slot: FoodSlot, profile: Profile | undefined): readonly FoodOptionId[] {
  const restrictions = restrictionsOf(profile);
  return POOLS[slot].filter((id) => optionAllowed(id, restrictions)).slice(0, SLOT_SIZE[slot]);
}

/** `{ protein: 'eggs.beans', ... }` for the slots a pattern uses, for the note's stored key. */
export function slotParams(
  slots: readonly FoodSlot[],
  profile: Profile | undefined,
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const slot of slots) out[slot] = encodeOptions(slotOptions(slot, profile));
  return out;
}

/**
 * Whether a free food name (the person's own logged food) conflicts with their restrictions: a
 * word of the name starts with a word of an allergy tag or a family keyword, or the diet rules out
 * the family the name sits in. Used so "a food you often have" is never one they said they avoid.
 */
export function foodNameConflicts(name: string, profile: Profile | undefined): boolean {
  const restrictions = restrictionsOf(profile);
  if (restrictions.families.size === 0 && restrictions.words.length === 0) return false;
  const folded = ` ${foldWords(name)} `;
  for (const family of restrictions.families) {
    const words = [...ALLERGY_WORDS[family], ...FAMILY_FOOD_WORDS[family]];
    if (words.some((w) => folded.includes(` ${foldWords(w)}`))) return true;
  }
  return restrictions.words.some((w) => folded.includes(` ${w}`) || folded.includes(w));
}

/**
 * Words of the FOODS in each family, for deciding whether a food the person logged is one they
 * avoid ("Yaourt nature" for a milk allergy). Folded; matched as the start of a word.
 */
const FAMILY_FOOD_WORDS: Readonly<Record<FoodFamily, readonly string[]>> = {
  dairy: [
    'yogurt',
    'yoghurt',
    'yaourt',
    'cheese',
    'fromage',
    'butter',
    'beurre',
    'cream',
    'creme',
    'skyr',
    'kefir',
    'ice cream',
    'glace',
  ],
  egg: ['omelette', 'mayonnaise'],
  fish: [
    'salmon',
    'saumon',
    'tuna',
    'thon',
    'sardine',
    'cod',
    'cabillaud',
    'mackerel',
    'maquereau',
    'anchois',
    'anchovy',
  ],
  shellfish: [
    'crevette',
    'shrimp',
    'prawn',
    'crabe',
    'crab',
    'moule',
    'mussel',
    'homard',
    'lobster',
    'huitre',
    'oyster',
  ],
  nuts: ['nutella', 'praline', 'pistache', 'cajou', 'noisette', 'amande', 'almond'],
  peanut: ['peanut', 'cacahuete', 'arachide'],
  gluten: [
    'bread',
    'pain',
    'pasta',
    'pate',
    'spaghetti',
    'flour',
    'farine',
    'couscous',
    'semoule',
    'biscuit',
    'baguette',
    'wheat',
    'ble',
  ],
  soy: ['tofu', 'tempeh', 'edamame', 'miso'],
  legume: [
    'lentil',
    'lentille',
    'chickpea',
    'pois chiche',
    'haricot',
    'bean',
    'houmous',
    'hummus',
    'falafel',
    'petit pois',
    'peas',
    'dal',
    'dhal',
    'fava',
  ],
  meat: [
    'beef',
    'boeuf',
    'pork',
    'porc',
    'chicken',
    'poulet',
    'ham',
    'jambon',
    'sausage',
    'saucisse',
    'lamb',
    'agneau',
    'veal',
    'veau',
    'bacon',
    'turkey',
    'dinde',
    'duck',
    'canard',
    'steak',
  ],
};

/** The slot a stored note param names, when the key is a slot name. */
export const SLOT_PARAM_KEYS: readonly string[] = FOOD_SLOTS;

/** The slots each pattern's copy uses (the template strings carry `{protein}`, `{dairy}`, ...). */
export const PATTERN_SLOTS: Readonly<Record<string, readonly FoodSlot[]>> = {
  vegRich: ['protein'],
  proteinMissingDay: ['protein'],
  dairyLight: ['dairy'],
  breakfastSimple: ['breakfast'],
  energyDenseSnack: ['snack'],
  proteinLowDay: ['protein'],
  fibreLowDay: ['fibre'],
};
