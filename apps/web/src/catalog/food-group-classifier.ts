/**
 * Best-effort `FoodGroup` classification from descriptive text. Port of
 * the earlier client, in English and French.
 *
 * Used in two places, which is why it lives on its own:
 *  - the barcode path classifies Open Food Facts `categories_tags` (`en:almond-milks`,
 *    `fr:pommes-de-terre`, ...);
 *  - the photo path falls back to it when a model's food has no valid `group` (the model's group
 *    is validated against the closed `FoodGroup` enum first), classifying the food NAME. Phase 6
 *    imports it from `src/catalog` and injects it; this module imports nothing from `src/ai`.
 *
 * Matching is on whole tokens (lowercased, accents removed, `xx:` language prefix removed,
 * non-alphanumerics treated as spaces, simple plural stemming: English `-s` / `-ies`, French
 * `-s` / `-eaux` / `-oux`), not substrings, so `eggplant` is not an egg, `licorice` is not rice
 * and `butterfly` is not butter. Overrides run before the generic keyword scan because the generic
 * words mislead:
 *
 *  - nut / seed butters (`peanut butter`, `beurre de cacahuète`, `tahini`) are PROTEIN, not dairy;
 *  - plant milks and dairy substitutes (`almond milk`, `oat drink`, `soy yogurt`, `lait d'avoine`,
 *    `boisson à l'avoine`, `yaourt de soja`) sit in the DAIRY quadrant: the arc's quadrant is the
 *    "milk and its alternatives" slot, and "milk" is how the person thinks of it. (Documented,
 *    deliberate: no group is the honest "other" for them.)
 *  - a few multi-word names whose parts say something else: `pomme de terre` is a STARCH (not an
 *    apple), `fruits de mer` is PROTEIN (not fruit), `haricots verts` and `petits pois` are
 *    vegetables, `pain d'épices` is a sweet (`other`).
 *
 * Accents are folded, so two French words can meet: `pâtes` (pasta) and `pâté` fold to `pates` and
 * `pate`; the plural is kept unstemmed (see {@link KEEP_FORM}) so they stay apart.
 *
 * Anything that matches nothing is `other`: never a guess. Pure TypeScript.
 */
import type { DatabaseFood, FoodGroup } from '@anc/core';
import { foldText } from './fold';

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
    const group = phraseGroup(t);
    if (group !== null) return group;
  }
  for (const t of normalized) {
    const group = classifyTokens(t);
    if (group !== 'other') return group;
  }
  return 'other';
}

/**
 * Classify ONE food name (the AI fallback's `ClassifyFoodGroup`, and every typed custom food): the
 * primary group, i.e. the first of {@link classifyFoodGroupsByName}. May be `other`.
 */
export function classifyFoodByName(name: string): FoodGroup {
  return classifyFoodGroupsByName(name)[0] ?? 'other';
}

/**
 * EVERY major group a food name mentions, primary first, without `other` (an empty list is
 * unclassified). A mixed dish counts in each of its parts: `chicken salad` is protein and
 * vegFruit, `tomato pasta` is starch and vegFruit, `lasagne` and `pizza` come from the small
 * {@link DISHES} table. Storage keeps one primary group per food; this is read at coaching time.
 *
 * The primary group is exactly what {@link classifyFoodGroup} says for the name, so the
 * single-group behaviour is unchanged. Fruit or herb flavours of a yogurt / milk / cream
 * (`strawberry yogurt`) stay dairy only.
 */
export function classifyFoodGroupsByName(name: string): readonly FoodGroup[] {
  const ts = tokens(name);
  if (isNutButter(ts)) return ['protein'];
  if (isPlantMilk(ts)) return ['dairy'];

  const found = new Set<FoodGroup>();
  const masked = new Set<number>();
  const claim = (table: readonly (readonly [readonly string[], readonly FoodGroup[]])[]) => {
    for (const [phrase, groups] of table) {
      for (let i = 0; i + phrase.length <= ts.length; i++) {
        if (!phrase.every((word, k) => ts[i + k] === word)) continue;
        for (let k = 0; k < phrase.length; k++) masked.add(i + k);
        for (const g of groups) if (g !== 'other') found.add(g);
      }
    }
  };
  claim(PHRASES.map(([phrase, group]) => [phrase, [group]] as const));
  claim(DISHES);

  // `lieu` (pollock) is a fish, but `au lieu de` ("instead of") is not a food.
  const rest = ts.filter((t, i) => !masked.has(i) && !(t === 'lieu' && ts[i - 1] === 'au'));
  const any = (set: ReadonlySet<string>): boolean => rest.some((t) => set.has(t));
  if (any(DAIRY)) found.add('dairy');
  if (any(PROTEIN)) found.add('protein');
  if (any(STARCH)) found.add('starch');
  if (any(VEG_FRUIT)) found.add('vegFruit');
  if (rest.some((t) => DAIRY_FLAVOURED.has(t)) && !rest.some((t) => SALAD.has(t))) {
    found.delete('vegFruit');
  }

  const primary = classifyFoodGroup([name]);
  const out = found.has(primary) ? [primary] : [];
  for (const g of found) if (g !== primary) out.push(g);
  return out;
}

/**
 * The groups a logged food counts in at coaching time: the stored group, plus whatever its name
 * says (a typed `chicken salad` stored as protein also counts as vegFruit). Open Food Facts
 * products keep their category-derived group alone: their names are brands and slogans.
 */
export function foodGroupsOfFood(food: DatabaseFood): readonly FoodGroup[] {
  if (food.source === 'off') return [food.foodGroup];
  const out: FoodGroup[] = food.foodGroup === 'other' ? [] : [food.foodGroup];
  for (const g of classifyFoodGroupsByName(food.displayName)) if (!out.includes(g)) out.push(g);
  return out.length > 0 ? out : ['other'];
}

function tokens(raw: string): string[] {
  // `légumes` (vegetables) must not fold into `legumes` (pulses, the English meaning): an accented
  // one is read as the French word. An unaccented `legumes` stays the English one. NFC first, so a
  // decomposed `e` + combining accent is the same letter; `légumineuse` (pulse) is left alone.
  let text = foldText(raw.normalize('NFC').replace(/légumes?(?![\p{L}])/giu, 'vegetable')).trim();
  // `en:almond-milks` -> `almond-milks`
  const colon = text.indexOf(':');
  if (colon >= 0 && colon <= 3) text = text.slice(colon + 1);
  return text
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
    .map(singular);
}

/**
 * Words that end like a plural but are not stemmed. `couscous`, `pois` (peas) and `ris` end in `s`
 * in the singular; `pates` (pasta) stays apart from `pate` (a pâté), which accent folding would
 * otherwise merge.
 */
const KEEP_FORM: ReadonlySet<string> = new Set(['couscous', 'pois', 'pates', 'ris', 'hummus']);

function singular(t: string): string {
  if (KEEP_FORM.has(t)) return t;
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  // French: `poireaux` -> `poireau`, `choux` -> `chou` (`noix` is its own singular).
  if (t.length > 4 && /(eau|ou)x$/.test(t)) return t.slice(0, -1);
  // English `-es` plurals (`tomatoes`, `radishes`, `sandwiches`, `peaches`). Not a bare `-ches`:
  // French `pêches` and `brioches` keep their `e`.
  if (t.length > 4 && /(oes|shes|wiches|eaches)$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

/** The stemmed form of each keyword, so a list reads naturally and matches a stemmed token. */
const words = (...list: string[]): ReadonlySet<string> => new Set(list.map(singular));

const NUT_WORDS = words(
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
  // French
  'cacahuete',
  'arachide',
  'amande',
  'cajou',
  'noisette',
  'noix',
  'pistache',
  'sesame',
  'tournesol',
  'graine',
);

/** "de", "d'" ("beurre d'amande"): skipped between a French butter and its nut. */
const FILLER: ReadonlySet<string> = new Set(['de', 'd', 'du']);

function isNutButter(ts: readonly string[]): boolean {
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i] as string;
    if (t === 'tahini' || t === 'tahin') return true;
    // English puts the nut first: `peanut butter`.
    if ((t === 'butter' || t === 'spread') && i > 0 && NUT_WORDS.has(ts[i - 1] as string)) {
      return true;
    }
    // French puts it after: `beurre de cacahuète`, `purée d'amande`.
    if (t === 'beurre' || t === 'puree') {
      let j = i + 1;
      while (j < ts.length && FILLER.has(ts[j] as string)) j++;
      if (j < ts.length && NUT_WORDS.has(ts[j] as string)) return true;
    }
  }
  return false;
}

const PLANT_WORDS = words(
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
  // French
  'amande',
  'avoine',
  'riz',
  'coco',
  'noisette',
  'cajou',
  'pois',
  'epeautre',
  'chanvre',
  'vegetal',
  'vegetale',
  'vegetaux',
  'vegane',
);

/** English milk words follow the plant (`oat drink`); French ones precede it (`lait d'avoine`). */
const MILK_WORDS = words('milk', 'drink', 'yogurt', 'yoghurt');
const MILK_WORDS_FR = words('lait', 'boisson', 'yaourt', 'yogourt');
/** How far after a French milk word its plant may stand (`boisson à l'avoine`: three tokens). */
const PLANT_AFTER = 3;

function isPlantMilk(ts: readonly string[]): boolean {
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i] as string;
    if ((t === 'substitute' || t === 'alternative') && i > 0) {
      const prev = ts[i - 1];
      if (prev === 'dairy' || prev === 'milk') return true;
    }
    if (t === 'non' && i + 1 < ts.length && ts[i + 1] === 'dairy') return true;
    const isMilkWord = MILK_WORDS.has(t) || MILK_WORDS_FR.has(t);
    if (isMilkWord && i > 0) {
      // `almond milk`, `plant based milk`, `oat drink`, `soy yogurt`
      for (let j = 0; j < i; j++) if (PLANT_WORDS.has(ts[j] as string)) return true;
    }
    if (MILK_WORDS_FR.has(t)) {
      // `lait d'avoine`, `boisson végétale`, `yaourt de soja`
      for (let j = i + 1; j < ts.length && j <= i + PLANT_AFTER; j++) {
        if (PLANT_WORDS.has(ts[j] as string)) return true;
      }
    }
  }
  return false;
}

/**
 * Multi-word names read as a whole, before the generic scan: each is a phrase of stemmed tokens
 * whose parts alone would classify wrongly (`pomme` and `fruit` are fruit, `haricot` is a legume).
 */
const PHRASES: readonly (readonly [readonly string[], FoodGroup])[] = (
  [
    ['pomme de terre', 'starch'],
    // Potato dishes named after the apple.
    ['pomme saute', 'starch'],
    ['pomme sautee', 'starch'],
    ['pomme vapeur', 'starch'],
    ['pomme noisette', 'starch'],
    ['pomme dauphine', 'starch'],
    ['pomme allumette', 'starch'],
    ['fruit de mer', 'protein'],
    ['noix de saint jacques', 'protein'],
    ['saint jacques', 'protein'],
    ['pois chiche', 'protein'],
    ['pois casse', 'protein'],
    ['petit pois', 'vegFruit'],
    ['haricot vert', 'vegFruit'],
    ['legume vert', 'vegFruit'],
    // English: the pod is a vegetable, the dried bean is a legume (`beans` alone stays protein).
    ['green bean', 'vegFruit'],
    ['runner bean', 'vegFruit'],
    ['french bean', 'vegFruit'],
    ['string bean', 'vegFruit'],
    ['snap pea', 'vegFruit'],
    ['split pea', 'protein'],
    ['black eyed pea', 'protein'],
    ['pumpkin seed', 'protein'],
    ['squash seed', 'protein'],
    ['corn flake', 'starch'],
    ['corn flour', 'starch'],
    ['corn starch', 'starch'],
    ['corn bread', 'starch'],
    ['corn chip', 'other'],
    ['corn oil', 'other'],
    ['sweet corn', 'vegFruit'],
    ['pate de campagne', 'protein'],
    ['vegetable vert', 'vegFruit'],
    // Sweets and pastry: not the pasta, fruit, cabbage or cream their words say.
    ['pain d epice', 'other'],
    ['pate a tartiner', 'other'],
    ['pates a tartiner', 'other'],
    ['pate de fruit', 'other'],
    ['pates de fruit', 'other'],
    ['pate feuillete', 'other'],
    ['pate feuilletee', 'other'],
    ['pates feuillete', 'other'],
    ['pates feuilletee', 'other'],
    ['pate a chou', 'other'],
    ['pates a chou', 'other'],
    ['creme de marron', 'other'],
    ['beurre de cacao', 'other'],
    // The chocolate egg, not a dairy / egg food.
    ['creme egg', 'other'],
  ] as const
).map(([phrase, group]) => [phrase.split(' ').map(singular), group] as const);

function phraseGroup(ts: readonly string[]): FoodGroup | null {
  for (const [phrase, group] of PHRASES) {
    for (let i = 0; i + phrase.length <= ts.length; i++) {
      if (phrase.every((word, k) => ts[i + k] === word)) return group;
    }
  }
  return null;
}

/** Dishes whose name says more than its keywords: each lists every group the dish counts in. */
const DISHES: readonly (readonly [readonly string[], readonly FoodGroup[]])[] = (
  [
    ['pizza', ['starch', 'dairy']],
    ['lasagne', ['starch', 'protein']],
    ['lasagna', ['starch', 'protein']],
    ['burger', ['protein', 'starch']],
    ['hamburger', ['protein', 'starch']],
    ['cheeseburger', ['protein', 'starch', 'dairy']],
    ['sandwich', ['starch']],
    ['panini', ['starch']],
    ['wrap', ['starch']],
    ['burrito', ['starch', 'protein']],
    ['taco', ['starch', 'protein']],
    ['kebab', ['protein', 'starch']],
    ['sushi', ['starch', 'protein']],
    ['ramen', ['starch', 'protein']],
    ['pad thai', ['starch', 'protein']],
    ['fish and chip', ['protein', 'starch']],
    ['quiche', ['starch', 'dairy', 'protein']],
    ['paella', ['starch', 'protein', 'vegFruit']],
    ['moussaka', ['protein', 'vegFruit']],
    ['minestrone', ['vegFruit', 'starch']],
    ['gazpacho', ['vegFruit']],
    ['smoothie', ['vegFruit']],
    ['bruschetta', ['starch', 'vegFruit']],
    ['cottage pie', ['protein', 'starch']],
    ['shepherd s pie', ['protein', 'starch']],
    ['risotto', ['starch']],
    // French
    ['croque monsieur', ['starch', 'dairy', 'protein']],
    ['croque madame', ['starch', 'dairy', 'protein']],
    ['gratin dauphinois', ['starch', 'dairy']],
    ['hachis parmentier', ['protein', 'starch']],
    ['pot au feu', ['protein', 'vegFruit']],
    ['tajine', ['protein', 'vegFruit']],
    ['tartiflette', ['starch', 'dairy', 'protein']],
    ['pissaladiere', ['starch', 'vegFruit']],
    ['tarte flambee', ['starch', 'dairy', 'protein']],
    ['crepe', ['starch']],
    ['galette', ['starch']],
    ['pancake', ['starch']],
    ['tartine', ['starch']],
  ] as const
).map(([phrase, groups]) => [phrase.split(' ').map(singular), groups] as const);

/** Fruit and herbs in these are flavours, not a serving of vegetables. */
const DAIRY_FLAVOURED = words(
  'yogurt',
  'yoghurt',
  'milk',
  'cream',
  'kefir',
  'skyr',
  'yaourt',
  'yogourt',
  'lait',
  'creme',
  'faisselle',
);
const SALAD = words('salad', 'salade');

const DAIRY = words(
  'milk',
  'cheese',
  'yogurt',
  'yoghurt',
  'dairy',
  'butter',
  'cream',
  'kefir',
  // French
  'lait',
  'laitage',
  'laitier',
  'fromage',
  'yaourt',
  'yogourt',
  'beurre',
  'creme',
  'skyr',
  'faisselle',
  'emmental',
  'camembert',
  'brie',
  'chevre',
  'gruyere',
  'comte',
  'mozzarella',
  'parmesan',
  'roquefort',
  'ricotta',
  'mascarpone',
  'feta',
  'raclette',
);
const PROTEIN = words(
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
  // French
  'viande',
  'poisson',
  'crustace',
  'coquillage',
  'volaille',
  'poulet',
  'dinde',
  'boeuf',
  'porc',
  'agneau',
  'veau',
  'canard',
  'lapin',
  'jambon',
  'saucisse',
  'saucisson',
  'charcuterie',
  'steak',
  'lardon',
  'oeuf',
  'saumon',
  'thon',
  'crevette',
  'sardine',
  'maquereau',
  'cabillaud',
  'colin',
  'truite',
  'merlu',
  'lentille',
  'haricot',
  'legumineuse',
  'seitan',
  'cacahuete',
  'arachide',
  'moule',
  'huitre',
  'calamar',
  'lieu',
  'merguez',
  'omelette',
  'feve',
  'flageolet',
);
const STARCH = words(
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
  // French
  'pates',
  'riz',
  'pain',
  'baguette',
  'brioche',
  'biscotte',
  'patate',
  'frite',
  'semoule',
  'ble',
  'boulgour',
  'cereale',
  'avoine',
  'farine',
  'nouille',
  'polenta',
  'gnocchi',
  'tapioca',
  'muesli',
  'granola',
  'spaghetti',
  'macaroni',
  'lasagne',
  'tagliatelle',
  'ravioli',
  'croissant',
);
const VEG_FRUIT = words(
  'vegetable',
  'fruit',
  'salad',
  'berry',
  'strawberry',
  'blueberry',
  'raspberry',
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
  'zucchini',
  'courgette',
  'kale',
  'cabbage',
  'cauliflower',
  'mushroom',
  'pea',
  'corn',
  'asparagus',
  'squash',
  'pumpkin',
  'leek',
  'beetroot',
  'beet',
  'radish',
  'celery',
  'fennel',
  'artichoke',
  'sprout',
  'rocket',
  'arugula',
  'chard',
  'cress',
  'watercress',
  'parsnip',
  'turnip',
  'swede',
  'okra',
  'shallot',
  'scallion',
  'coleslaw',
  'slaw',
  'veggie',
  'veg',
  'crudite',
  'ratatouille',
  'plum',
  'apricot',
  'cherry',
  'kiwi',
  'pineapple',
  'melon',
  'watermelon',
  'grapefruit',
  'mandarin',
  'clementine',
  'tangerine',
  'nectarine',
  'fig',
  'pomegranate',
  'papaya',
  'lychee',
  'lime',
  'blackberry',
  'cranberry',
  'currant',
  'gooseberry',
  'compote',
  // French
  'salade',
  'baie',
  'pomme',
  'banane',
  'tomate',
  'carotte',
  'epinard',
  'brocoli',
  'concombre',
  'laitue',
  'oignon',
  'poivron',
  'raisin',
  'poire',
  'peche',
  'mangue',
  'citron',
  'avocat',
  'fraise',
  'framboise',
  'myrtille',
  'cerise',
  'abricot',
  'prune',
  'kiwi',
  'ananas',
  'melon',
  'pasteque',
  'courgette',
  'courge',
  'potiron',
  'citrouille',
  'chou',
  'poireau',
  'champignon',
  'radis',
  'betterave',
  'navet',
  'celeri',
  'fenouil',
  'artichaut',
  'asperge',
  'mandarine',
  'clementine',
  'pamplemousse',
  'figue',
  'endive',
  'roquette',
  'pruneau',
  'epinard',
  'blette',
  'cresson',
  'mache',
  'oseille',
  'panais',
  'rutabaga',
  'cornichon',
  'echalote',
  'potimarron',
  'butternut',
  'mais',
  'crudite',
  'ratatouille',
  'compote',
  'nectarine',
  'litchi',
  'grenade',
  'papaye',
  'mure',
  'cassis',
  'groseille',
  'kaki',
  'veggie',
  'brocoli',
  'aubergine',
  'tomate',
  'cerfeuil',
);

function classifyTokens(all: readonly string[]): FoodGroup {
  // `lieu` (pollock) is a fish, but `au lieu de` ("instead of") is not a food.
  const ts = all.filter((t, i) => !(t === 'lieu' && all[i - 1] === 'au'));
  const any = (set: ReadonlySet<string>): boolean => ts.some((t) => set.has(t));
  // `eggplant` is one token, so `egg` never matches it. Order: the group a word is MOST
  // specifically about first: dairy beats a fruit flavour ("fruit yogurt"), starch beats a
  // vegetable adjective.
  if (any(DAIRY)) return 'dairy';
  if (any(PROTEIN)) return 'protein';
  if (any(STARCH)) return 'starch';
  if (any(VEG_FRUIT)) return 'vegFruit';
  return 'other';
}
