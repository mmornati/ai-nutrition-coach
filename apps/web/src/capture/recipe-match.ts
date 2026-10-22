/**
 * Which catalogue food a recipe line means. A wrong silent pick ("lait" giving coconut milk, "riz"
 * giving cooked wholegrain rice) puts wrong nutrients in the recipe, so a recipe line is not taken
 * from the catalogue's plain ranking: it is searched in the language the RECIPE is written in, the
 * candidates are re-scored here, and a pick the score does not stand behind is offered as up to three
 * suggestions instead of being made.
 *
 * Rules, all pinned by tests on the real catalogue:
 *  - Language: {@link detectRecipeLanguage} reads the pasted text (accents, headings, units and glue
 *    words), falling back to the app's language on a tie; the catalogue is asked in that language
 *    (`search(..., { locale })`), so "lait" finds the seed Lait and plain CIQUAL milks.
 *  - Score (unclamped, so two good candidates still order): 0.40 x the share of the line's words the
 *    name has, + 0.25 when the name starts with the line's first word (the head noun; CIQUAL puts it
 *    first), + 0.35 x 1/(1 + 0.6 x extra words), where an extra word is one the line does not have
 *    (the doneness words cru / cuit / sec / raw / cooked ... and "(average)" are not extra).
 *  - A name that adds a different main food the line does not mention ("coco", "amande", "soja",
 *    "riz" in a flour ...) loses 0.30.
 *  - A bare ingredient means its usual kind: a name with the default variety of that word (farine
 *    de BLE, sucre BLANC, lait ENTIER, riz BLANC, "wheat flour", "white sugar" ...) gains 0.10.
 *  - Recipes list RAW weights, so unless the line says cooked / cuit (or raw / cru) a raw or dry name
 *    gains and a cooked one loses: 0.08 for any food, and 0.20 / 0.25 for rice, pasta, grains, pulses
 *    and potatoes (CIQUAL 0202 / 0203 / 0301), where the cooked row weighs about 2.5 times as much per
 *    gram of dry food. The curated seeds of those foods hold COOKED values and count as cooked there
 *    (a test pins that against the CIQUAL names). For those foods "<name> cru" / "<name> raw" is
 *    searched too, because the catalogue's own ranking puts cooked rows first.
 *  - Floor: below {@link MATCH_FLOOR} (0.60) the line is not auto-matched; it is listed "not matched
 *    yet" with up to {@link MAX_SUGGESTIONS} (3) best candidates scoring at least
 *    {@link SUGGESTION_FLOOR} (0.30), each one tap away.
 */
import type { FoodCatalog, FoodMatch } from '@anc/core';
import { indexTokens } from '../catalog/ciqual-index';
import { foldText } from '../catalog/fold';

export type RecipeLanguage = 'en' | 'fr';

/** Below this a candidate is not picked on the person's behalf. */
export const MATCH_FLOOR = 0.6;
/** A candidate must reach this to be offered as a suggestion. */
export const SUGGESTION_FLOOR = 0.3;
export const MAX_SUGGESTIONS = 3;
/** How many catalogue results are read per search. */
const SEARCH_LIMIT = 15;

// ───────────────────────── language ─────────────────────────

const FR_WORDS: ReadonlySet<string> = new Set([
  'ingredients',
  'pour',
  'personnes',
  'personne',
  'portions',
  'parts',
  'preparation',
  'etapes',
  'cuillere',
  'cuilleres',
  'soupe',
  'cafe',
  'pincee',
  'tasse',
  'tasses',
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'et',
  'au',
  'aux',
  'une',
  'un',
  'avec',
  'sans',
  'beurre',
  'farine',
  'sucre',
  'lait',
  'oeufs',
  'oeuf',
  'sel',
  'poivre',
  'huile',
  'minutes',
  'melangez',
  'ajoutez',
  'cuire',
  'faites',
  'gousses',
  'gousse',
  'oignon',
  'oignons',
  'riz',
  'pates',
]);
const EN_WORDS: ReadonlySet<string> = new Set([
  'ingredients',
  'serves',
  'servings',
  'serving',
  'method',
  'instructions',
  'directions',
  'cup',
  'cups',
  'tablespoon',
  'tablespoons',
  'tbsp',
  'tsp',
  'teaspoon',
  'teaspoons',
  'pinch',
  'the',
  'and',
  'of',
  'with',
  'without',
  'butter',
  'flour',
  'sugar',
  'milk',
  'eggs',
  'egg',
  'salt',
  'pepper',
  'oil',
  'minutes',
  'mix',
  'add',
  'cook',
  'cloves',
  'clove',
  'onion',
  'onions',
  'rice',
  'pasta',
  'chopped',
  'sliced',
]);

/**
 * The language a pasted recipe is written in: one point per accented letter or French / English
 * marker word (a word of both, like "ingredients", scores for neither), the app's language on a tie.
 */
export function detectRecipeLanguage(text: string, fallback: RecipeLanguage): RecipeLanguage {
  let fr = (text.match(/[àâçéèêëîïôœùûü]/giu) ?? []).length;
  let en = 0;
  for (const raw of text.slice(0, 8000).split(/[^\p{L}\p{N}]+/u)) {
    const word = foldText(raw);
    if (word === '') continue;
    const inFr = FR_WORDS.has(word);
    const inEn = EN_WORDS.has(word);
    if (inFr && !inEn) fr += 1;
    else if (inEn && !inFr) en += 1;
  }
  if (fr === en) return fallback;
  return fr > en ? 'fr' : 'en';
}

// ───────────────────────── scoring ─────────────────────────

const RAW_WORDS: ReadonlySet<string> = new Set([
  'cru',
  'crue',
  'raw',
  'sec',
  'seche',
  'dry',
  'dried',
  'uncooked',
]);
const COOKED_WORDS: ReadonlySet<string> = new Set([
  'cuit',
  'cuite',
  'cooked',
  'boiled',
  'bouilli',
  'steamed',
  'fried',
  'frit',
  'roasted',
  'roti',
]);
/** Words that qualify a row without making it a different food. */
const NEUTRAL_WORDS: ReadonlySet<string> = new Set([
  ...RAW_WORDS,
  ...COOKED_WORDS,
  'moyen',
  'average',
  'aliment',
  'sans',
  'without',
  'ajoute',
  'added',
  'non',
  'sel',
  'salt',
]);

/** A different main food in the name, wrong unless the line itself has it. */
const OTHER_FOODS: ReadonlySet<string> = new Set([
  'coco',
  'coconut',
  'amande',
  'almond',
  'soja',
  'soya',
  'soy',
  'avoine',
  'oat',
  'noisette',
  'hazelnut',
  'cacahuete',
  'arachide',
  'peanut',
  'chataigne',
  'chestnut',
  'sarrasin',
  'buckwheat',
  'mais',
  'maize',
  'corn',
  'millet',
  'orge',
  'barley',
  'seigle',
  'rye',
  'epeautre',
  'spelt',
  'riz',
  'rice',
  'cacao',
  'cocoa',
  'chocolat',
  'chocolate',
  'vanille',
  'vanilla',
  'vanille',
  'noix',
  'nut',
  'poudre',
  'powder',
  'biscuit',
  'sauce',
  'vinaigre',
  'vinegar',
]);

/** What a bare ingredient word usually means in a recipe (the first word of the line -> name words). */
const DEFAULT_VARIETY: Readonly<Record<string, readonly string[]>> = {
  farine: ['ble', 'froment'],
  flour: ['wheat'],
  sucre: ['blanc'],
  sugar: ['white'],
  lait: ['entier'],
  milk: ['whole'],
  riz: ['blanc'],
  rice: ['white'],
  pates: ['standard'],
  pasta: ['regular'],
};

/** Heads whose cooked and raw rows both exist and differ a lot: CIQUAL 0202, 0203, 0301. */
const COOKABLE_HEADS: ReadonlySet<string> = new Set([
  'riz',
  'rice',
  'pates',
  'pasta',
  'spaghetti',
  'macaroni',
  'tagliatelle',
  'penne',
  'fusilli',
  'semoule',
  'semolina',
  'couscous',
  'boulgour',
  'bulgur',
  'quinoa',
  'lentille',
  'lentil',
  'haricot',
  'bean',
  'flageolet',
  'millet',
  'orge',
  'barley',
  'polenta',
  'patate',
  'potato',
]);

/** The curated seeds that hold COOKED values (a test pins them against the CIQUAL names). */
export const COOKED_SEEDS: ReadonlySet<string> = new Set([
  'seed:rice',
  'seed:pasta',
  'seed:potato',
  'seed:quinoa',
  'seed:lentils',
  'seed:chickpeas',
]);

const has = (tokens: readonly string[], words: ReadonlySet<string>): boolean =>
  tokens.some((t) => words.has(t));

const covers = (cand: string, query: string): boolean => cand === query || cand.startsWith(query);

/** The line's own words, folded and stemmed, and what it says about doneness. */
export interface LineWords {
  readonly tokens: readonly string[];
  /** The line says cooked, raw, dry ...: the person chose, so no raw preference applies. */
  readonly statesDoneness: boolean;
  /** Rice, pasta, grains, pulses, potatoes. */
  readonly cookable: boolean;
}

export function lineWords(term: string): LineWords {
  const tokens = indexTokens(term);
  const joined = tokens.join(' ');
  const head = tokens[0] ?? '';
  return {
    tokens,
    statesDoneness: has(tokens, RAW_WORDS) || has(tokens, COOKED_WORDS),
    cookable:
      COOKABLE_HEADS.has(head) || joined.startsWith('pomme terre') || joined.startsWith('potato'),
  };
}

/** The score of one candidate for a line (see the header); 0 when it shares no word with it. */
export function scoreCandidate(line: LineWords, match: FoodMatch): number {
  const cand = indexTokens(match.food.displayName);
  const query = line.tokens.filter((t) => !NEUTRAL_WORDS.has(t));
  if (cand.length === 0 || query.length === 0) return 0;
  const found = query.filter((q) => cand.some((c) => covers(c, q))).length;
  if (found === 0) return 0;
  const first = query[0] as string;
  const head = covers(cand[0] as string, first) ? 1 : cand.some((c) => covers(c, first)) ? 0.5 : 0;
  const extras = cand.filter(
    (c) => !NEUTRAL_WORDS.has(c) && !query.some((q) => covers(c, q)),
  ).length;
  let score = 0.4 * (found / query.length) + 0.25 * head + 0.35 * (1 / (1 + 0.6 * extras));
  if (cand.some((c) => OTHER_FOODS.has(c) && !query.some((q) => covers(c, q)))) score -= 0.3;
  const defaults = DEFAULT_VARIETY[first];
  if (query.length === 1 && defaults !== undefined && cand.some((c) => defaults.includes(c))) {
    score += 0.1;
  }
  if (!line.statesDoneness) {
    const cookedSeed = line.cookable && COOKED_SEEDS.has(match.food.sourceRef);
    const raw = has(cand, RAW_WORDS);
    const cooked = has(cand, COOKED_WORDS) || cookedSeed;
    if (raw) score += line.cookable ? 0.2 : 0.08;
    else if (cooked) score -= line.cookable ? 0.25 : 0.08;
  }
  return score;
}

// ───────────────────────── searching ─────────────────────────

export type IngredientMatch =
  /** A candidate the score stands behind. */
  | { readonly kind: 'matched'; readonly match: FoodMatch; readonly score: number }
  /** Nothing reached the floor: up to three to pick from. */
  | { readonly kind: 'unsure'; readonly suggestions: readonly FoodMatch[] }
  | { readonly kind: 'none' };

/** The searches made for a line: its name, its first two words, and the raw form for cookables. */
function queriesFor(term: string, words: LineWords, language: RecipeLanguage): readonly string[] {
  const parts = term.split(' ').filter((p) => p !== '');
  const base = [term, parts.slice(0, 2).join(' ')];
  const out = new Set(base.filter((q) => q.length >= 2));
  if (words.cookable && !words.statesDoneness) {
    for (const q of [...out]) {
      for (const raw of language === 'fr' ? ['cru', 'sec'] : ['raw', 'dry']) out.add(`${q} ${raw}`);
    }
  }
  return [...out];
}

/**
 * The best catalogue food for the line named `term` (its name, without amount or unit), searched in
 * `language`. Never throws.
 */
export async function matchIngredient(
  term: string,
  catalog: FoodCatalog,
  language: RecipeLanguage,
): Promise<IngredientMatch> {
  const words = lineWords(term);
  const pool = new Map<string, FoodMatch>();
  for (const query of queriesFor(term, words, language)) {
    try {
      const result = await catalog.search(query, { limit: SEARCH_LIMIT, locale: language });
      if (result.kind !== 'rankedMatches') continue;
      for (const m of result.matches)
        if (!pool.has(m.food.sourceRef)) pool.set(m.food.sourceRef, m);
    } catch {
      // This search failed; the others still count.
    }
  }
  const scored = [...pool.values()]
    .map((match) => ({ match, score: scoreCandidate(words, match) }))
    .filter((s) => s.score > 0)
    // A stable order for equal scores: the catalogue's own (insertion) order.
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best === undefined) return { kind: 'none' };
  if (best.score >= MATCH_FLOOR) return { kind: 'matched', match: best.match, score: best.score };
  const suggestions = scored
    .filter((s) => s.score >= SUGGESTION_FLOOR)
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => s.match);
  return suggestions.length === 0 ? { kind: 'none' } : { kind: 'unsure', suggestions };
}
