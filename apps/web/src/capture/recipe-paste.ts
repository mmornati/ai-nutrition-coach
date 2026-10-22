/**
 * "Paste a recipe", the no-AI way: the text a person pastes (an ingredients list, or the whole text
 * of a recipe page) is read on this device and each ingredient line is looked up in the on-device
 * catalogue. Nothing is fetched and nothing is sent anywhere; it works offline. The result only
 * PREFILLS the recipe editor for review: nothing is saved by this module.
 *
 * Rules, all pinned by tests:
 *  - The text is cut at {@link MAX_RECIPE_TEXT_LENGTH} characters and control characters become spaces.
 *  - The ingredients are the lines after a line that is only "Ingredients" / "Ingrédients" (optionally
 *    with a colon, a `#`, or the first ingredient on the same line), up to a line that is only
 *    "Instructions" / "Method" / "Préparation" / "Steps" and the like. Without such a heading, every
 *    short line is an ingredient candidate (a pasted bare list).
 *  - One ingredient per line. A leading bullet or tick box is dropped. A leading amount is read:
 *    whole and decimal numbers (comma or dot), `1/2`, `1 1/2`, `½ ¼ ¾ ⅓ ⅔ ⅛`, a range ("2-3": the
 *    middle), and `2 x 400 g`. Units: g, kg, mg, oz, lb, ml, cl, dl, l, tbsp / c. à soupe, tsp / c. à
 *    café, cup / tasse, pinch / pincée (English and French).
 *  - Grams: a weight unit is exact (g, kg, mg, oz, lb). Everything else is an ESTIMATE and is marked
 *    as one (`gramsEstimated`): a volume (ml, cl, dl, l, a cup) is taken as that many grams only
 *    when the ingredient is a liquid (water, milk, stock, juice, wine, vinegar, cream, beer,
 *    coffee, tea, sauce; oil at 0.92 g/ml), a cup is 240 ml; a tablespoon is 15 g, a teaspoon 5 g, a
 *    pinch 0.5 g, whatever the ingredient (honey and flour differ, hence the estimate). A volume of
 *    a solid, and an amount with no unit ("3 eggs"), get no weight: the person picks one.
 *  - Servings: "Serves 4", "Servings: 4", "4 servings", "Makes 6", "Pour 4 personnes",
 *    "4 portions", "Rendement : 6 parts"; whole numbers 1 to 100.
 *  - Words end where no letter or digit follows (`\b` is ASCII-only: "2 gâteaux" is not "2 g").
 *  - The catalogue's best match is used per line; a line nothing matches, or that has no weight
 *    this module can work out, is listed as "not added" for the person to pick by hand.
 */
import {
  MAX_GRAMS,
  MAX_INGREDIENTS,
  MAX_SERVINGS,
  type FoodCatalog,
  type FoodEntryDraft,
  type FoodMatch,
  type QuantityRange,
} from '@anc/core';
import { indexTokens } from '../catalog/ciqual-index';
import { detectRecipeLanguage, matchIngredient, type RecipeLanguage } from './recipe-match';

/** The longest pasted text, in characters. */
export const MAX_RECIPE_TEXT_LENGTH = 8000;

/** Estimated conversions, documented in the header above. */
export const TABLESPOON_GRAMS = 15;
export const TEASPOON_GRAMS = 5;
export const PINCH_GRAMS = 0.5;
export const CUP_ML = 240;
export const OIL_GRAMS_PER_ML = 0.92;

export type RecipeUnit = 'g' | 'ml' | 'tbsp' | 'tsp' | 'cup' | 'pinch';

/** One ingredient line as read from the text: what to look up, and the amount if there is one. */
export interface ParsedIngredientLine {
  /** The line as pasted (trimmed, bullet removed). */
  readonly raw: string;
  /** What to look up in the catalogue ("olive oil", not "2 tbsp olive oil"). */
  readonly term: string;
  /** Grams that need no ingredient knowledge (g, kg, mg, oz, lb): exact, not estimated. */
  readonly exactGrams?: number;
  /** An amount in a unit that needs the ingredient's kind to become grams. */
  readonly amount?: { readonly value: number; readonly unit: Exclude<RecipeUnit, 'g'> };
  /** A bare count ("3 eggs"): turned into grams with the matched food's piece weight, an estimate. */
  readonly count?: number;
}

export interface ParsedRecipeText {
  readonly name?: string;
  readonly servings?: number;
  readonly lines: readonly ParsedIngredientLine[];
}

/** An ingredient ready for the editor, with the line it came from (shown next to the matched name). */
export interface PrefillIngredient {
  readonly draft: FoodEntryDraft;
  /** The line as pasted ("200 g de riz"), or the AI's ingredient name. */
  readonly from: string;
}

/** A line the matcher would not pick for the person: listed, with up to three one-tap suggestions. */
export interface NotAddedLine {
  readonly raw: string;
  /** Candidates with this line's weight, when the line has one the app can use. */
  readonly suggestions: readonly PrefillIngredient[];
}

/** What a pasted recipe fills in. Nothing here is saved. */
export interface RecipePrefill {
  readonly name?: string;
  readonly servings?: number;
  /** Matched in the catalogue with confidence and weighed: ready for the editor. */
  readonly ingredients: readonly PrefillIngredient[];
  /** The lines that were not matched with confidence, or have no weight to use. */
  readonly notAdded: readonly NotAddedLine[];
  /** True when at least one ingredient's weight is converted or guessed. */
  readonly anyEstimated: boolean;
}

// ───────────────────────── reading the text ─────────────────────────

const END = "(?![\\p{L}\\p{N}'’])";
const START = '(?<![\\p{L}\\p{N}])';

const FRACTIONS: Readonly<Record<string, number>> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
};
const FRAC_CHARS = Object.keys(FRACTIONS).join('');

/** `1 1/2`, `1/2`, `1½`, `½`, `2,5`, `2.5`, `2` (as source text of a regex group). */
const NUM = `(?:\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d*\\s*[${FRAC_CHARS}]|\\d+(?:[.,]\\d+)?)`;

/** The value of a matched number text. `null` when it is not a usable number. */
export function numberOf(text: string): number | null {
  const t = text.trim();
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/u.exec(t);
  if (mixed)
    return Number(mixed[2]) === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const simple = /^(\d+)\s*\/\s*(\d+)$/u.exec(t);
  if (simple) return Number(simple[2]) === 0 ? null : Number(simple[1]) / Number(simple[2]);
  const glyph = new RegExp(`^(\\d*)\\s*([${FRAC_CHARS}])$`, 'u').exec(t);
  if (glyph) return Number(glyph[1] || 0) + (FRACTIONS[glyph[2] ?? ''] ?? 0);
  const plain = /^\d+(?:[.,]\d+)?$/u.exec(t);
  return plain ? Number(t.replace(',', '.')) : null;
}

interface UnitSpec {
  readonly pattern: string;
  /** Grams per unit when weight; otherwise the unit kind and its ml (for volumes). */
  readonly kind: 'weight' | 'volume' | Exclude<RecipeUnit, 'g' | 'ml'>;
  readonly factor: number;
}

// Longer spellings first inside each alternative: "tablespoons" before "tbsp" is not needed (END
// guards the end), but "c. à soupe" must be tried before "c".
const UNITS: readonly UnitSpec[] = [
  { pattern: 'kg|kilos?|kilogrammes?|kilograms?', kind: 'weight', factor: 1000 },
  { pattern: 'mg|milligrammes?|milligrams?', kind: 'weight', factor: 0.001 },
  { pattern: 'g|gr|grammes?|grams?', kind: 'weight', factor: 1 },
  { pattern: 'oz|ounces?|onces?', kind: 'weight', factor: 28.35 },
  { pattern: 'lbs?|pounds?|livres?', kind: 'weight', factor: 453.6 },
  { pattern: 'ml|millilit(?:re|er)s?', kind: 'volume', factor: 1 },
  { pattern: 'cl|centilit(?:re|er)s?', kind: 'volume', factor: 10 },
  { pattern: 'dl|decilit(?:re|er)s?|décilit(?:re|er)s?', kind: 'volume', factor: 100 },
  { pattern: 'l|lit(?:re|er)s?', kind: 'volume', factor: 1000 },
  {
    pattern:
      'tbsp|tbs|tablespoons?|table\\s+spoons?|c\\.?\\s*[àa]\\.?\\s*s(?:oupe)?\\.?|cuill[eè]res?\\s+[àa]\\s+soupe|c[àa]s|cs',
    kind: 'tbsp',
    factor: 1,
  },
  {
    pattern:
      'tsp|teaspoons?|tea\\s+spoons?|c\\.?\\s*[àa]\\.?\\s*c(?:af[eé])?\\.?|cuill[eè]res?\\s+[àa]\\s+caf[eé]|c[àa]c|cc',
    kind: 'tsp',
    factor: 1,
  },
  { pattern: 'cups?|tasses?', kind: 'cup', factor: 1 },
  { pattern: 'pinch(?:es)?|pinc[ée]es?', kind: 'pinch', factor: 1 },
];

const UNIT_RES = UNITS.map((u) => ({
  spec: u,
  re: new RegExp(`^(?:${u.pattern})${END}\\.?\\s*`, 'iu'),
}));

const BULLET = /^[\s\-–—•*·▪‣◦►>✓✔☐□]+/u;
const LEADING_FILLER = new RegExp(
  `^(?:(?:of|de la|du|des|de)${END}\\s+|de l['’]\\s*|d['’]\\s*|l['’]\\s*)`,
  'iu',
);

const INGREDIENTS_HEADING =
  /^\s*(?:#+\s*)?(?:the\s+)?(?:ingredients?|ingr[ée]dients?)\s*(?:list)?\s*[:：]?\s*(.*)$/iu;
const END_HEADING =
  /^\s*(?:#+\s*)?(?:instructions?|directions?|method|preparation|préparation|[ée]tapes?|steps?|recette|m[ée]thode|pr[ée]paration|notes?|nutrition(?:al)?(?:\s+\w+)?)\s*[:：]?\s*$/iu;

const SERVINGS_RES: readonly RegExp[] = [
  new RegExp(
    `${START}(?:serves|servings?|makes|yields?|portions?|rendement|pour|nombre\\s+de\\s+(?:personnes|portions|parts))${END}\\s*[:：]?\\s*(?:about\\s+|environ\\s+|~)?(\\d{1,3})${END}`,
    'iu',
  ),
  new RegExp(
    `${START}(\\d{1,3})\\s*(?:servings?|portions?|personnes?|pers\\.?|parts?|convives?|people)${END}`,
    'iu',
  ),
];

/** Servings stated in the text, whole numbers 1 to 100; `undefined` when none. */
export function servingsOf(text: string): number | undefined {
  for (const re of SERVINGS_RES) {
    const m = re.exec(text);
    const n = m === null ? NaN : Number(m[1]);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_SERVINGS) return n;
  }
  return undefined;
}

function cleanText(text: string): string {
  return Array.from(text.replace(/\p{Cc}/gu, (c) => (c === '\n' || c === '\r' ? '\n' : ' ')))
    .slice(0, MAX_RECIPE_TEXT_LENGTH)
    .join('');
}

/** The words that need no more than a name: used to cut "tomatoes, chopped" and "(optional)". */
function termOf(rest: string): string {
  const noParens = rest.replace(/\([^)]*\)/gu, ' ').replace(/\[[^\]]*\]/gu, ' ');
  const beforeComma = noParens.split(/[,;:]| - | – /u)[0] ?? noParens;
  return beforeComma.replace(/\s+/g, ' ').trim();
}

/** Reads one line: its amount (if it starts with one) and what is left as the name. */
export function parseIngredientLine(rawLine: string): ParsedIngredientLine | null {
  const raw = rawLine.replace(BULLET, '').replace(/\s+/g, ' ').trim();
  if (raw === '' || Array.from(raw).length > 160) return null;
  let rest = raw;
  let multiplier = 1;
  let value: number | null = null;
  const multi = new RegExp(`^(\\d{1,2})\\s*[x×]\\s*(?=\\d)`, 'iu').exec(rest);
  if (multi) {
    multiplier = Number(multi[1]);
    rest = rest.slice(multi[0].length);
  }
  const range = new RegExp(`^(${NUM})\\s*(?:-|–|—|to|à)\\s*(${NUM})(?=\\s|[\\p{L}]|$)`, 'iu').exec(
    rest,
  );
  const single = new RegExp(`^(${NUM})(?![\\d/])`, 'u').exec(rest);
  if (range) {
    const a = numberOf(range[1] ?? '');
    const b = numberOf(range[2] ?? '');
    if (a !== null && b !== null && b >= a) {
      value = (a + b) / 2;
      rest = rest.slice(range[0].length).trimStart();
    }
  }
  if (value === null && single) {
    value = numberOf(single[1] ?? '');
    if (value !== null) rest = rest.slice(single[0].length).trimStart();
  }
  if (value === null) {
    const term = termOf(rest.replace(LEADING_FILLER, ''));
    return term === '' ? null : { raw, term };
  }
  const total = value * multiplier;
  for (const { spec, re } of UNIT_RES) {
    const m = re.exec(rest);
    if (!m) continue;
    const after = rest.slice(m[0].length).replace(LEADING_FILLER, '');
    const term = termOf(after);
    if (term === '') return null;
    if (spec.kind === 'weight') return { raw, term, exactGrams: total * spec.factor };
    if (spec.kind === 'volume') {
      return { raw, term, amount: { value: total * spec.factor, unit: 'ml' } };
    }
    return { raw, term, amount: { value: total, unit: spec.kind } };
  }
  // A count ("3 eggs", "2 gâteaux"): not a weight; the whole line is the name.
  const term = termOf(rest.replace(LEADING_FILLER, ''));
  return term === '' ? null : { raw, term, count: total };
}

/** Reads the pasted text: a name (when the first line looks like a title), servings and ingredient lines. */
export function parseRecipeText(rawText: string): ParsedRecipeText {
  const text = cleanText(rawText);
  const all = text.split('\n').map((l) => l.trim());
  const nonEmpty = all.filter((l) => l !== '');
  const headingIndex = nonEmpty.findIndex((l) => INGREDIENTS_HEADING.test(l) && l.length < 80);
  let candidates: string[];
  let name: string | undefined;
  if (headingIndex >= 0) {
    const heading = INGREDIENTS_HEADING.exec(nonEmpty[headingIndex] ?? '');
    const tail = heading?.[1]?.trim() ?? '';
    const after = nonEmpty.slice(headingIndex + 1);
    const stop = after.findIndex((l) => END_HEADING.test(l));
    candidates = [...(tail === '' ? [] : [tail]), ...(stop >= 0 ? after.slice(0, stop) : after)];
    const first = nonEmpty[0] ?? '';
    if (headingIndex > 0 && Array.from(first).length <= 80 && !servingsOf(first)) {
      name = first.replace(/^#+\s*/u, '').trim();
    }
  } else {
    candidates = nonEmpty;
  }
  const lines: ParsedIngredientLine[] = [];
  for (const candidate of candidates) {
    // The servings line is not an ingredient; neither is a long sentence of a page without a heading.
    if (servingsOf(candidate) !== undefined && Array.from(candidate).length <= 40) continue;
    if (headingIndex < 0 && Array.from(candidate).length > 100) continue;
    const parsed = parseIngredientLine(candidate);
    if (parsed !== null) lines.push(parsed);
    if (lines.length >= MAX_INGREDIENTS + 10) break;
  }
  const servings = servingsOf(text);
  return {
    ...(name === undefined || name === '' ? {} : { name }),
    ...(servings === undefined ? {} : { servings }),
    lines,
  };
}

// ───────────────────────── weights ─────────────────────────

const LIQUID = new RegExp(
  `${START}(?:water|eau|milk|lait|stock|broth|bouillon|fond|juice|jus|wine|vin|vinegar|vinaigre|cream|cr[eè]me|beer|bi[eè]re|coffee|caf[eé]|tea|th[eé]|sauce|soup|soupe|syrup|sirop|cider|cidre|rum|rhum|brandy|cognac|liqueur|oil|huile|yogh?urt|yaourt|kefir|k[eé]fir)${END}`,
  'iu',
);
const OIL = new RegExp(`${START}(?:oil|huile)${END}`, 'iu');

/** True when the ingredient name says a pourable liquid. */
export function isLiquid(term: string): boolean {
  return LIQUID.test(term);
}

/** The grams of a parsed line, with whether they are an estimate; `undefined` when there is no weight to use. */
export function gramsOfLine(
  line: ParsedIngredientLine,
): { readonly grams: number; readonly estimated: boolean } | undefined {
  const round = (g: number): number => Math.round(g * 10) / 10;
  if (line.exactGrams !== undefined) {
    return { grams: round(line.exactGrams), estimated: false };
  }
  const a = line.amount;
  if (a === undefined) return undefined;
  let grams: number | undefined;
  if (a.unit === 'tbsp') grams = a.value * TABLESPOON_GRAMS;
  else if (a.unit === 'tsp') grams = a.value * TEASPOON_GRAMS;
  else if (a.unit === 'pinch') grams = a.value * PINCH_GRAMS;
  else if (isLiquid(line.term)) {
    const ml = a.unit === 'cup' ? a.value * CUP_ML : a.value;
    grams = ml * (OIL.test(line.term) ? OIL_GRAMS_PER_ML : 1);
  }
  if (grams === undefined) return undefined;
  const g = round(grams);
  return g >= 0.1 && g <= MAX_GRAMS ? { grams: g, estimated: true } : undefined;
}

/** The quantity an ingredient carries in the editor: grams, flagged when they are a guess. */
export function gramsQuantity(grams: number, estimated: boolean): QuantityRange {
  return {
    low: grams,
    high: grams,
    unit: 'g',
    displayLabel: `${grams} g`,
    grams,
    gramsEstimated: estimated,
  };
}

// ───────────────────────── pieces ─────────────────────────

/**
 * Grams of one piece of a few common foods, when neither the seed nor the catalogue says (CIQUAL
 * lists per-100 g values and no pieces). Round household figures: ESTIMATES, flagged as such.
 */
const PIECE_GRAMS: Readonly<Record<string, number>> = {
  oeuf: 55,
  egg: 55,
  oignon: 110,
  onion: 110,
  carotte: 80,
  carrot: 80,
  tomate: 120,
  tomato: 120,
  banane: 120,
  banana: 120,
  pomme: 150,
  apple: 150,
  citron: 80,
  lemon: 80,
};

/** One piece of the matched food: a seed's own piece preset first, then the table above. */
export function pieceGrams(term: string, match: FoodMatch): number | undefined {
  for (const preset of match.presets) {
    if (preset.unit === 'piece' && preset.low === preset.high && preset.low > 0) {
      const g = preset.grams;
      if (g !== undefined && g > 0) return g / preset.low;
    }
  }
  const tokens = indexTokens(term);
  const head = tokens[0];
  // "pomme de terre" is a potato, not an apple.
  if (head === undefined || (head === 'pomme' && tokens.length > 1)) return undefined;
  return PIECE_GRAMS[head];
}

/**
 * The weight of a line once its food is known: grams the text gave or the units imply, else a count
 * times one piece (an estimate). `undefined` when there is nothing to weigh with.
 */
export function weightFor(
  line: ParsedIngredientLine,
  match: FoodMatch,
): { readonly grams: number; readonly estimated: boolean } | undefined {
  const direct = gramsOfLine(line);
  if (direct !== undefined || line.count === undefined) return direct;
  const piece = pieceGrams(line.term, match);
  if (piece === undefined) return undefined;
  const grams = Math.round(line.count * piece * 10) / 10;
  return grams >= 0.1 && grams <= MAX_GRAMS ? { grams, estimated: true } : undefined;
}

// ───────────────────────── the catalogue ─────────────────────────

const ingredientOf = (
  match: FoodMatch,
  weight: { readonly grams: number; readonly estimated: boolean },
  from: string,
): PrefillIngredient => ({
  draft: { databaseFood: match.food, quantity: gramsQuantity(weight.grams, weight.estimated) },
  from,
});

/**
 * Looks every parsed line up (in `language`, the recipe's) and weighs it. A line the matcher is not
 * sure of, or that has no weight, goes to `notAdded` with its text (and up to three suggestions when
 * it has a weight). At most {@link MAX_INGREDIENTS} ingredients are returned.
 */
export async function prefillFromParsed(
  parsed: ParsedRecipeText,
  catalog: FoodCatalog,
  language: RecipeLanguage = 'en',
): Promise<RecipePrefill> {
  const ingredients: PrefillIngredient[] = [];
  const notAdded: NotAddedLine[] = [];
  let anyEstimated = false;
  for (const line of parsed.lines) {
    const found = await matchIngredient(line.term, catalog, language);
    if (found.kind === 'matched' && ingredients.length < MAX_INGREDIENTS) {
      const weight = weightFor(line, found.match);
      if (weight !== undefined) {
        if (weight.estimated) anyEstimated = true;
        ingredients.push(ingredientOf(found.match, weight, line.raw));
        continue;
      }
    }
    const candidates =
      found.kind === 'matched' ? [found.match] : found.kind === 'unsure' ? found.suggestions : [];
    const suggestions = candidates.flatMap((m) => {
      const weight = weightFor(line, m);
      return weight === undefined ? [] : [ingredientOf(m, weight, line.raw)];
    });
    notAdded.push({ raw: line.raw, suggestions });
  }
  return {
    ...(parsed.name === undefined ? {} : { name: parsed.name }),
    ...(parsed.servings === undefined ? {} : { servings: parsed.servings }),
    ingredients,
    notAdded,
    anyEstimated,
  };
}

/** The whole local path: read the text, detect its language, look the lines up. */
export async function recipeFromText(
  text: string,
  catalog: FoodCatalog,
  fallbackLanguage: RecipeLanguage = 'en',
): Promise<RecipePrefill> {
  const language = detectRecipeLanguage(text, fallbackLanguage);
  return prefillFromParsed(parseRecipeText(text), catalog, language);
}

/** A recipe read by an AI: names and weights only (structurally `ReadRecipe` of `ai/describe-recipe`). */
export interface AiReadRecipe {
  readonly name?: string;
  readonly servings?: number;
  readonly ingredients: readonly {
    readonly name: string;
    readonly grams: number;
    readonly estimated: boolean;
  }[];
}

/**
 * The AI's names and weights, with the ingredients matched in the on-device catalogue by the same
 * rules as the local path, in the app's language (the language the AI was asked to name them in).
 * No nutrient of the AI is used: a name the matcher is not sure of goes to `notAdded` (with its
 * weight and suggestions) for the person to pick by hand.
 */
export async function prefillFromAi(
  recipe: AiReadRecipe,
  catalog: FoodCatalog,
  language: RecipeLanguage = 'en',
): Promise<RecipePrefill> {
  const ingredients: PrefillIngredient[] = [];
  const notAdded: NotAddedLine[] = [];
  let anyEstimated = false;
  for (const item of recipe.ingredients) {
    const weight = { grams: item.grams, estimated: item.estimated };
    const found = await matchIngredient(item.name, catalog, language);
    if (found.kind === 'matched' && ingredients.length < MAX_INGREDIENTS) {
      if (item.estimated) anyEstimated = true;
      ingredients.push(ingredientOf(found.match, weight, item.name));
      continue;
    }
    const candidates =
      found.kind === 'matched' ? [found.match] : found.kind === 'unsure' ? found.suggestions : [];
    notAdded.push({
      raw: `${item.name} (${item.estimated ? '≈' : ''}${item.grams} g)`,
      suggestions: candidates.map((m) => ingredientOf(m, weight, item.name)),
    });
  }
  return {
    ...(recipe.name === undefined ? {} : { name: recipe.name }),
    ...(recipe.servings === undefined ? {} : { servings: recipe.servings }),
    ingredients,
    notAdded,
    anyEstimated,
  };
}
