/**
 * What a logged food IS, read from its name (English and French, accents and case ignored) and its
 * per-100 g nutrients, for the coach rules that need it: sugary drinks, alcohol and the food-quality
 * observations (pulses, fish, wholegrain starches, nuts, processed and red meat).
 *
 * The stored `foodGroup` is too coarse for these ("protein" holds fish, eggs, ham and lentils), and
 * the core knows no catalogue codes, so the rules read the NAME, the same way the web app's group
 * classifier does. Matching is on whole words (a plural `s` is ignored), never on substrings, so
 * "poisson pané" is fish, "haricots verts" are not pulses, "pâtes" are not "pâté" and "noix de
 * coco" is not a nut. Every list below is small and tested against real CIQUAL rows
 * (apps/web/src/catalog/food-detect.ciqual.test.ts). A rule that is not sure says nothing: a food
 * that matches no list is simply not counted.
 */
import type { DatabaseFood } from '../entities/database-food';
import { foldWords } from './food-options';

const stem = (w: string): string =>
  w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;

const wordsOf = (name: string): string[] =>
  foldWords(name)
    .split(' ')
    .filter((w) => w !== '')
    .map(stem);

/** A list entry the way a name's words are read (folded, plural `s` dropped). */
const stemmed = (entry: string): string => wordsOf(entry).join(' ');

class Name {
  readonly words: readonly string[];
  readonly text: string;
  constructor(display: string) {
    this.words = wordsOf(display);
    this.text = ` ${this.words.join(' ')} `;
  }
  /** Any of the single words is a whole word of the name. */
  has(...list: readonly string[]): boolean {
    return list.some((w) => this.words.includes(stemmed(w)));
  }
  /** Any of the (folded, singular) phrases appears as whole words. */
  phrase(...list: readonly string[]): boolean {
    return list.some((p) => this.text.includes(` ${stemmed(p)} `));
  }
}

const nameOf = (food: DatabaseFood): Name => new Name(food.displayName);

// ---------------------------------------------------------------------------------------------
// Drinks
// ---------------------------------------------------------------------------------------------

/** Sugars (g per 100 g, a drink being about 1 g per ml) from which a drink counts as sugary. */
export const SUGARY_DRINK_SUGARS_PER_100 = 5;

const DRINK_WORDS = [
  'soda',
  'cola',
  'coca',
  'pepsi',
  'fanta',
  'sprite',
  'orangina',
  'limonade',
  'lemonade',
  'jus',
  'juice',
  'nectar',
  'sirop',
  'syrup',
  'boisson',
  'drink',
  'schweppes',
  'tonic',
  'redbull',
  'smoothie',
];
const NOT_A_SUGARY_DRINK = [
  'lait',
  'milk',
  'avoine',
  'oat',
  'amande',
  'almond',
  'soja',
  'soy',
  'riz',
  'yaourt',
  'yogurt',
  'soupe',
  'soup',
  'bouillon',
  'broth',
  'legume',
  'vegetable',
  'tomate',
  'tomato',
  'cafe',
  'coffee',
  'the',
  'tea',
  'infusion',
  'eau',
  'water',
  'vinaigre',
  'vinegar',
  'chocolat',
  'cocoa',
  'cacao',
];

/** Beer, wine, cider and spirits by name; "sans alcool" and "alcohol free" versions are not. */
export function isAlcohol(food: DatabaseFood): boolean {
  const n = nameOf(food);
  if (n.phrase('sans alcool', 'alcohol free', 'non alcoholic', 'non alcoolise', 'sans alcohol')) {
    return false;
  }
  if (
    n.has('vinaigre', 'vinegar', 'vinaigrette', 'sauce', 'cuisine', 'cooking', 'gateau', 'cake')
  ) {
    return false;
  }
  return n.has(
    'biere',
    'beer',
    'vin',
    'wine',
    'cidre',
    'cider',
    'whisky',
    'whiskey',
    'vodka',
    'rhum',
    'rum',
    'gin',
    'cognac',
    'champagne',
    'pastis',
    'liqueur',
    'brandy',
    'tequila',
    'aperitif',
    'cocktail',
    'sake',
    'porto',
    'martini',
    'prosecco',
  );
}

/** A drink with sugars (soda, juice, syrup, sweetened drinks) at 5 g per 100 g or more. */
export function isSugaryDrink(food: DatabaseFood): boolean {
  const sugars = food.nutrientsPer100g?.sugars;
  if (sugars === undefined || sugars < SUGARY_DRINK_SUGARS_PER_100) return false;
  const n = nameOf(food);
  if (isAlcohol(food)) return false;
  // Sweetened iced tea or coffee is a sugary drink; plain tea, coffee and infusions are not.
  if (n.phrase('ice tea', 'iced tea', 'the glace', 'ice coffee', 'cafe glace')) return true;
  if (n.has(...NOT_A_SUGARY_DRINK) && !n.has('cola', 'soda', 'limonade', 'lemonade')) return false;
  return n.has(...DRINK_WORDS) || n.phrase('ice tea', 'iced tea', 'the glace', 'energy drink');
}

// ---------------------------------------------------------------------------------------------
// Food-quality kinds (PNNS-style week rules)
// ---------------------------------------------------------------------------------------------

const NOT_PLAIN_FOOD = ['sauce', 'huile', 'oil', 'bouillon', 'cube', 'arome', 'soupe', 'soup'];

/** "Sauce au poisson", "Huile de poisson": the name leads with a condiment, not the food. */
const leadsWithCondiment = (n: Name): boolean =>
  n.words[0] !== undefined && NOT_PLAIN_FOOD.map(stemmed).includes(n.words[0]);

export function isFish(food: DatabaseFood): boolean {
  const n = nameOf(food);
  if (leadsWithCondiment(n) || n.has('chat', 'poissonnerie', 'capsule', 'gelule', 'supplement')) {
    return false;
  }
  return n.has(
    'poisson',
    'fish',
    'saumon',
    'salmon',
    'thon',
    'tuna',
    'cabillaud',
    'cod',
    'morue',
    'sardine',
    'maquereau',
    'mackerel',
    'truite',
    'trout',
    'merlu',
    'hake',
    'colin',
    'lieu',
    'haddock',
    'anchois',
    'anchovy',
    'hareng',
    'herring',
    'sole',
    'dorade',
    'daurade',
    'bream',
    'flétan',
    'fletan',
    'halibut',
    'lotte',
    'turbot',
    'espadon',
    'swordfish',
    'tilapia',
    'pangasius',
    'raie',
    'rouget',
    'sandre',
    'perche',
    'brochet',
    'eglefin',
  );
}

export function isPulse(food: DatabaseFood): boolean {
  const n = nameOf(food);
  if (n.has('vert', 'green', 'beurre', 'germe', 'sprout')) {
    // "haricots verts", "green beans", "pois" in a soup: vegetables, not pulses.
    if (!n.has('lentille', 'lentil', 'chiche', 'chickpea')) return false;
  }
  if (
    n.has('lentille', 'lentil', 'flageolet', 'chickpea', 'chiche', 'dal', 'dhal', 'fève', 'feve')
  ) {
    return true;
  }
  if (n.phrase('pois chiche', 'pois casse', 'split pea', 'black eyed pea', 'pois cassé')) {
    return true;
  }
  if (n.has('haricot', 'bean')) {
    // Dry beans only: coloured or named kinds, "dry", "baked beans"; never plain "haricot".
    return n.has(
      'rouge',
      'blanc',
      'noir',
      'sec',
      'coco',
      'lingot',
      'azuki',
      'adzuki',
      'mungo',
      'kidney',
      'black',
      'white',
      'red',
      'baked',
      'borlotti',
      'cannellini',
      'pinto',
      'navy',
      'dry',
      'dried',
    );
  }
  return false;
}

const CEREAL_STARCH = [
  'pain',
  'bread',
  'baguette',
  'pate',
  'pasta',
  'spaghetti',
  'macaroni',
  'tagliatelle',
  'penne',
  'nouille',
  'noodle',
  'riz',
  'rice',
  'semoule',
  'couscous',
  'boulgour',
  'bulgur',
  'cereale',
  'cereal',
  'muesli',
  'biscotte',
  'tortilla',
  'wrap',
  'farine',
  'flour',
  'quinoa',
  'avoine',
  'oat',
  'flocon',
  'porridge',
  'sarrasin',
  'buckwheat',
  'blé',
  'ble',
  'orge',
  'barley',
  'seigle',
  'rye',
  'epeautre',
  'spelt',
  'pita',
  'galette',
];

/** A cereal starch (bread, pasta, rice, semolina, breakfast cereal, flour...): not a potato. */
export function isCerealStarch(food: DatabaseFood): boolean {
  if (food.foodGroup !== 'starch') return false;
  const n = nameOf(food);
  if (n.has('epice', 'spice')) return false;
  // "pâtes" folds to "pate" (the plural s is dropped); "pâté" is a different story and is protein.
  return n.has(...CEREAL_STARCH);
}

export function isWholegrain(food: DatabaseFood): boolean {
  const n = nameOf(food);
  if (n.phrase('pas complet', 'not wholegrain', 'non complet')) return false;
  return (
    n.has(
      'complet',
      'complete',
      'integral',
      'integrale',
      'wholegrain',
      'wholemeal',
      'brun',
      'brown',
      'avoine',
      'oat',
      'sarrasin',
      'buckwheat',
      'quinoa',
      'seigle',
      'rye',
      'epeautre',
      'spelt',
      'muesli',
      'porridge',
    ) || n.phrase('whole grain', 'whole wheat', 'semi complet', 'grain entier', 'ble entier')
  );
}

/** Word stems that make a nut food something else (a sweet, a salted snack, a spread, a drink). */
const NOT_A_PLAIN_NUT = [
  'pate',
  'huile',
  'oil',
  'lait',
  'milk',
  'drink',
  'boisson',
  'coco',
  'muscade',
  'nutmeg',
  'saint',
  'veau',
  'beurre',
  'butter',
  'puree',
  'tartiner',
  'spread',
  'chocolat',
  'biscuit',
  'gateau',
  'cake',
  'barre',
  'bar',
  'sale',
  'salt',
  'creme',
  'cream',
  'carame',
  'praline',
  'nougat',
  'enrob',
  'coat',
  'glace',
  'ice',
  'sirop',
  'syrup',
  'confiture',
  'jam',
  'melange',
  'apero',
  'aromatis',
  'flavo',
  'sucre',
  'sweet',
  'miel',
  'honey',
];

/**
 * A nut or seed eaten as such (whole or chopped): unsalted, unsweetened.
 *
 * DECISION: a nut BUTTER or paste ("peanut butter", "beurre de cacahuète", "pâte d'arachide") does
 * NOT count toward the "handful of unsalted nuts" guidance. It is eaten in a different quantity and
 * way (a spread, a spoonful), so it says nothing about having a handful of nuts. It still counts
 * for the PEANUT allergy family (`food-options.ts`): a person allergic to peanuts is never offered
 * it back.
 */
export function isUnsaltedNut(food: DatabaseFood): boolean {
  const n = nameOf(food);
  if (n.words.some((w) => NOT_A_PLAIN_NUT.some((stem) => w.startsWith(stem)))) return false;
  return n.has(
    'noix',
    'nut',
    'amande',
    'almond',
    'noisette',
    'hazelnut',
    'pistache',
    'pistachio',
    'cajou',
    'cashew',
    'pecan',
    'pacane',
    'macadamia',
    'cacahuete',
    'arachide',
    'peanut',
    'walnut',
    'brazil',
    'sesame',
    'tournesol',
    'sunflower',
    'chia',
    'flaxseed',
  );
}

const PROCESSED_MEAT = [
  'jambon',
  'ham',
  'saucisson',
  'saucisse',
  'sausage',
  'lardon',
  'bacon',
  'chorizo',
  'salami',
  'pepperoni',
  'mortadelle',
  'rillette',
  'terrine',
  'boudin',
  'andouille',
  'andouillette',
  'merguez',
  'knack',
  'francfort',
  'frankfurter',
  'cervelas',
  'bresaola',
  'coppa',
  'pancetta',
  'speck',
  'jambonneau',
  'charcuterie',
  'hotdog',
  'chipolata',
  'saucissons',
];

/**
 * Words that say a "sausage", "burger" or "ham" is made from plants ("saucisse végétale", "plant-based
 * sausages", "vegan nuggets", "saucisse de tofu"): such a food is neither processed nor red meat.
 * Folded, singular; the feminine and plural French forms are listed because a stem drops only a
 * plural `s`.
 */
const PLANT_BASED_WORDS = [
  'vegetal',
  'vegetale',
  'vegetaux',
  'vegetarien',
  'vegetarienne',
  'vegetarian',
  'vegan',
  'vegane',
  'veggie',
  'soja',
  'soy',
  'tofu',
  'tempeh',
  'seitan',
  'plant',
  'meatless',
  'vegetalien',
  'vegetalienne',
];

const isPlantBased = (n: Name): boolean =>
  n.has(...PLANT_BASED_WORDS) ||
  n.phrase('sans viande', 'meat free', 'a base de plantes', 'base de plantes');

export function isProcessedMeat(food: DatabaseFood): boolean {
  const n = nameOf(food);
  if (isPlantBased(n) || n.has('sauce')) {
    return false;
  }
  if (n.phrase('hot dog', 'luncheon meat', 'pate de campagne', 'pate de foie', 'pate en croute')) {
    return true;
  }
  return n.has(...PROCESSED_MEAT);
}

const RED_MEAT = [
  'boeuf',
  'beef',
  'veau',
  'veal',
  'porc',
  'pork',
  'agneau',
  'lamb',
  'mouton',
  'mutton',
  'cheval',
  'steak',
  'entrecote',
  'bavette',
  'rumsteck',
  'gigot',
  'faux filet',
  'cote de boeuf',
  'rosbif',
  'roastbeef',
];

/** Beef, veal, pork, lamb, mutton and horse (PNNS "viandes rouges"); processed meat is its own kind. */
export function isRedMeat(food: DatabaseFood): boolean {
  const n = nameOf(food);
  if (isProcessedMeat(food)) return false;
  if (leadsWithCondiment(n) || isPlantBased(n) || n.has('burger')) return false;
  return n.has(...RED_MEAT) || n.phrase('viande hachee', 'minced meat', 'ground meat');
}

export interface FoodKinds {
  readonly fish: boolean;
  readonly pulse: boolean;
  readonly wholegrain: boolean;
  readonly cerealStarch: boolean;
  readonly nut: boolean;
  readonly processedMeat: boolean;
  readonly redMeat: boolean;
  readonly sugaryDrink: boolean;
  readonly alcohol: boolean;
}

/** Every kind a food has (a food may have several: a "lentil and sausage stew"). */
export function foodKinds(food: DatabaseFood): FoodKinds {
  const cerealStarch = isCerealStarch(food);
  return {
    fish: isFish(food),
    pulse: isPulse(food),
    cerealStarch,
    wholegrain: cerealStarch && isWholegrain(food),
    nut: isUnsaltedNut(food),
    processedMeat: isProcessedMeat(food),
    redMeat: isRedMeat(food),
    sugaryDrink: isSugaryDrink(food),
    alcohol: isAlcohol(food),
  };
}
