/**
 * The no-AI way to "Describe a meal": split what was typed into foods and look each up in the
 * on-device catalogue. Works offline and sends nothing anywhere, so it is what the Describe sheet
 * does when there is no AI (or the person said "not now" to it). It is a convenience, not
 * understanding: it splits on commas, semicolons, new lines and the words "and" / "et" (also "+",
 * "plus", "puis", "then"; "&" does not split, so "mac & cheese" stays one food; "with" does not split, so "toast with butter" stays one food), drops a
 * leading amount ("2", "two", "a", "un", "150 g of", "a cup of") and takes the catalogue's best
 * match for what is left. A weight typed in grams ("150 g rice") is kept as the portion; a
 * leading count ("3 eggs", "deux œufs", "½ avocado") multiplies the match's default portion.
 */
import {
  isValidQuantity,
  recognizedPlate,
  type FoodCatalog,
  type FoodMatch,
  type QuantityRange,
  type RecognitionResult,
  type RecognizedFood,
} from '@anc/core';
import { MAX_DESCRIPTION_LENGTH } from '../ai/describe-meal';
import { foodName } from '../catalog/food-display';

/** At most this many pieces are looked up. */
export const MAX_DESCRIBED_PIECES = 10;
/** A piece longer than this is cut (a food name never needs more). */
const MAX_PIECE_LENGTH = 60;

// A comma between two digits is a decimal comma ("1,5 portions"), not a separator.
const SEPARATORS = /(?:(?<!\d),|,(?!\d)|[;\n\r])+|\s+(?:and|et|plus|puis|then)\s+|\s*\+\s*/giu;

const NUMBER_WORDS =
  'a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|some|half|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|demie|demi|quelques';
const UNIT_WORDS =
  'g|gr|kg|mg|ml|cl|dl|l|oz|cups?|tasses?|slices?|tranches?|glass(?:es)?|verres?|pieces?|pi[eè]ces?|bowls?|bols?|spoons?|cuill[eè]res?|tbsp|tsp|cs|cc|handfuls?|poign[eé]es?|portions?|servings?';
// `\b` is ASCII-only ("2 gâteaux" would read as 2 g + "âteaux"): a word ends where no letter or digit follows.
const END = "(?![\\p{L}\\p{N}'’])";
// "a dozen eggs", "une douzaine d'œufs": a count in words that is not a single number word.
const DOZEN = `(?:(?:a|one|une)\\s+)?(?:dozen|douzaine)${END}\\s*(?:(?:of|de|d['’])\\s*)?`;
// "3-4 eggs", "3 to 4 eggs": a range of counts (the lower bound is used).
const RANGE_SEP = '(?:\\s*[-–]\\s*|\\s+(?:to|à)\\s+)';
// "2x eggs", "2 x eggs", "2 × eggs": a multiplication sign is not a word of the food.
const TIMES = /^(\d+(?:[.,]\d+)?)\s*[x×](?=\s+\p{L})\s*/iu;
const LEADING_AMOUNT = new RegExp(
  `^(?:${DOZEN}|(?:\\d+${RANGE_SEP}\\d+(?=\\s)|\\d+\\s*/\\s*\\d+|\\d+(?:[.,]\\d+)?|[½¼¾]|(?:${NUMBER_WORDS})${END})\\s*(?:(?:${UNIT_WORDS})${END}\\.?\\s*)?)?` +
    `(?:(?:of|de la|du|des|de)\\s+|de l['’]|d['’]|l['’])?`,
  'iu',
);
const GRAMS = new RegExp(
  `(?<![\\p{L}\\p{N}])(\\d+(?:[.,]\\d+)?)\\s*(?:g|gr|grams?|grammes?)${END}`,
  'iu',
);

/** The foods named in a description, in order. Never more than {@link MAX_DESCRIBED_PIECES}. */
export function splitDescription(text: string): readonly string[] {
  const pieces = text
    .slice(0, MAX_DESCRIPTION_LENGTH)
    .split(SEPARATORS)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p !== '');
  return pieces
    .slice(0, MAX_DESCRIBED_PIECES)
    .map((p) => Array.from(p).slice(0, MAX_PIECE_LENGTH).join(''));
}

/** What to look up for one piece: the piece without its leading amount ("2 eggs" gives "eggs"). */
export function searchTermOf(piece: string): string {
  const term = piece.replace(TIMES, '$1 ').replace(LEADING_AMOUNT, '').trim();
  return term === '' ? piece : term;
}

/** A weight the person typed in grams ("150 g rice"), as a portion; `undefined` otherwise. */
function typedPortion(piece: string): QuantityRange | undefined {
  const m = GRAMS.exec(piece);
  const grams = m === null ? NaN : Number((m[1] ?? '').replace(',', '.'));
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) return undefined;
  return { low: 1, high: 1, unit: 'g', displayLabel: `${grams} g`, grams };
}

const COUNT_WORDS: Readonly<Record<string, number>> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  half: 0.5,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  demi: 0.5,
  demie: 0.5,
};
const VULGAR: Readonly<Record<string, number>> = { '½': 0.5, '¼': 0.25, '¾': 0.75 };
// Metric / weight units keep today's behaviour (the amount is dropped, the preset stays).
const METRIC_UNITS = /^(?:g|gr|kg|mg|ml|cl|dl|l|oz)$/iu;
const MAX_COUNT = 99;
const COUNT = new RegExp(
  `^(?:(\\d+)\\s*/\\s*(\\d+)|(\\d+(?:[.,]\\d+)?)|([½¼¾]))(?:\\s+|(?=(?:${UNIT_WORDS})${END}))` +
    `(?:(${UNIT_WORDS})${END})?|^(${Object.keys(COUNT_WORDS).join('|')})${END}\\s+(?:(${UNIT_WORDS})${END})?`,
  'iu',
);

/**
 * Words that follow a number inside a food's NAME ("4 seasons pizza", "5 cereal bread", "7 grain
 * bread", "4 épices"): there the number is not a count, so the portion is not multiplied.
 */
const NAME_WORDS = new RegExp(
  `^(?:seasons?|saisons?|cheeses?|fromages?|cereals?|c[ée]r[ée]ales?|grains?|graines?|spices?|[ée]pices?|quarts?)${END}`,
  'iu',
);
const DOZEN_COUNT = new RegExp(`^(?:(?:a|one|une)\\s+)?(?:dozen|douzaine)${END}`, 'iu');
const RANGE_COUNT = new RegExp(`^(\\d+)${RANGE_SEP}(\\d+)\\s+(?:(${UNIT_WORDS})${END}\\s*)?`, 'iu');

/** The count a piece starts with, and the text it was written as ("4", "quatre"). */
interface LeadingCount {
  readonly count: number;
  readonly text: string;
}

function parseLeadingCount(piece: string): LeadingCount {
  const none: LeadingCount = { count: 1, text: '' };
  const text = piece.trim().replace(TIMES, '$1 ');
  if (DOZEN_COUNT.test(text)) return { count: 12, text: 'dozen' };
  const range = RANGE_COUNT.exec(text);
  if (range !== null) {
    const unit = range[3];
    if (unit !== undefined && METRIC_UNITS.test(unit)) return none;
    const low = Number(range[1]);
    const high = Number(range[2]);
    if (low <= 0 || low >= high || low > MAX_COUNT) return none;
    if (NAME_WORDS.test(text.slice(range[0].length))) return none;
    return { count: low, text: range[1] ?? '' };
  }
  const m = COUNT.exec(text);
  if (m === null) return none;
  const unit = m[5] ?? m[7];
  if (unit !== undefined && METRIC_UNITS.test(unit)) return none;
  // The number belongs to the name of the food, not to how many were eaten.
  if (unit === undefined && NAME_WORDS.test(text.slice(m[0].length))) return none;
  let n: number;
  if (m[1] !== undefined && m[2] !== undefined) {
    const den = Number(m[2]);
    n = den === 0 ? NaN : Number(m[1]) / den;
  } else if (m[3] !== undefined) n = Number(m[3].replace(',', '.'));
  else if (m[4] !== undefined) n = VULGAR[m[4]] ?? NaN;
  else n = COUNT_WORDS[(m[6] ?? '').toLowerCase()] ?? NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_COUNT) return none;
  return { count: n, text: (m[3] ?? m[6] ?? '').toLowerCase() };
}

/**
 * A count typed in front of a piece ("3 eggs", "deux œufs", "1,5 portions", "½ avocado",
 * "1/2 avocado", "2 slices of bread", "a banana" = 1, "2x eggs", "a dozen eggs" = 12, "3-4 eggs"
 * = 3). Conservative on purpose: the count must be the very first token and be followed by a
 * space (or by a unit word glued to it, "2tbsp"), so "7up" or "3d printed" are not counts;
 * "some" / "a few" / "quelques" are not counts; a count in front of a metric unit ("200 ml milk")
 * is not scaled (the preset stays, as before); a number that starts the name of a food ("4 seasons
 * pizza", "5 cereal bread", "4 épices") is not a count; anything above {@link MAX_COUNT} or zero
 * is ignored. Returns 1 when there is no count.
 */
export function leadingCount(piece: string): number {
  return parseLeadingCount(piece).count;
}

/** True when `name` contains `token` as a whole word ("4" in "Pizza 4 fromages"). */
function nameHasToken(name: string, token: string): boolean {
  if (token === '') return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(name);
}

const fmt = (n: number): string => String(Math.round(n * 100) / 100);

/** The default portion times `count`; the unscaled portion when the result would be invalid. */
function scaled(base: QuantityRange, count: number): QuantityRange {
  if (count === 1) return base;
  // "2 × 1 egg": the label stays truthful whatever the unit's grammar.
  const displayLabel = `${fmt(count)} × ${base.displayLabel}`;
  const out: QuantityRange = {
    ...base,
    low: base.low * count,
    high: base.high * count,
    displayLabel,
    ...(base.grams !== undefined ? { grams: Math.round(base.grams * count * 10) / 10 } : {}),
  };
  return isValidQuantity(out) ? out : base;
}

export interface LocalDescription {
  /** The best catalogue match of each piece, as recognised foods (all ticked in the review sheet). */
  readonly result: RecognitionResult;
  /** The other matches of each piece, offered unticked. */
  readonly closestMatches: readonly FoodMatch[];
  /** The pieces nothing matched (the review sheet has a custom food field for those). */
  readonly unmatched: readonly string[];
}

/**
 * Looks every piece up in the catalogue. Never throws: a search that fails leaves that piece
 * unmatched. A food that two pieces both match is listed once.
 */
export async function describeLocally(
  text: string,
  catalog: FoodCatalog,
): Promise<LocalDescription> {
  const foods: RecognizedFood[] = [];
  const closest: FoodMatch[] = [];
  const unmatched: string[] = [];
  const used = new Set<string>();
  for (const piece of splitDescription(text)) {
    let matches: readonly FoodMatch[] = [];
    for (const term of new Set([searchTermOf(piece), piece])) {
      try {
        const result = await catalog.search(term, { limit: 4 });
        if (result.kind === 'rankedMatches' && result.matches.length > 0) {
          matches = result.matches;
          break;
        }
      } catch {
        // This piece cannot be looked up; the others still can.
      }
    }
    const [top, ...others] = matches.filter((m) => !used.has(m.food.sourceRef));
    if (top === undefined) {
      unmatched.push(piece);
      continue;
    }
    used.add(top.food.sourceRef);
    // Grams typed anywhere in the piece win over a count ("2 eggs 120 g" is 120 g).
    // A number that is part of the matched food's own name ("Pizza 4 fromages") is not a count.
    const parsed = parseLeadingCount(piece);
    const names = [top.food.displayName, foodName(top.food, 'en'), foodName(top.food, 'fr')];
    const count = names.some((n) => nameHasToken(n, parsed.text)) ? 1 : parsed.count;
    const typed = typedPortion(piece);
    const quantity =
      typed ??
      scaled(
        top.presets[0] ?? { low: 1, high: 1, unit: 'serving', displayLabel: '1 serving' },
        count,
      );
    foods.push({ databaseFood: top.food, confidence: top.confidence, quantity });
    closest.push(top, ...others.slice(0, 2));
  }
  return { result: recognizedPlate(foods), closestMatches: closest, unmatched };
}
