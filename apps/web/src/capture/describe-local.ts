/**
 * The no-AI way to "Describe a meal": split what was typed into foods and look each up in the
 * on-device catalogue. Works offline and sends nothing anywhere, so it is what the Describe sheet
 * does when there is no AI (or the person said "not now" to it). It is a convenience, not
 * understanding: it splits on commas, semicolons, new lines and the words "and" / "et" (also "+",
 * "plus", "puis", "then"; "&" does not split, so "mac & cheese" stays one food; "with" does not split, so "toast with butter" stays one food), drops a
 * leading amount ("2", "two", "a", "un", "150 g of", "a cup of") and takes the catalogue's best
 * match for what is left. A weight typed in grams ("150 g rice") is kept as the portion.
 */
import {
  recognizedPlate,
  type FoodCatalog,
  type FoodMatch,
  type QuantityRange,
  type RecognitionResult,
  type RecognizedFood,
} from '@anc/core';
import { MAX_DESCRIPTION_LENGTH } from '../ai/describe-meal';

/** At most this many pieces are looked up. */
export const MAX_DESCRIBED_PIECES = 10;
/** A piece longer than this is cut (a food name never needs more). */
const MAX_PIECE_LENGTH = 60;

const SEPARATORS = /[,;\n\r]+|\s+(?:and|et|plus|puis|then)\s+|\s*\+\s*/giu;

const NUMBER_WORDS =
  'a|an|one|two|three|four|five|six|seven|eight|nine|ten|some|half|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|demi|quelques';
const UNIT_WORDS =
  'g|gr|kg|mg|ml|cl|dl|l|oz|cups?|tasses?|slices?|tranches?|glass(?:es)?|verres?|pieces?|pi[eè]ces?|bowls?|bols?|spoons?|cuill[eè]res?|tbsp|tsp|cs|cc|handfuls?|poign[eé]es?|portions?|servings?';
// `\b` is ASCII-only ("2 gâteaux" would read as 2 g + "âteaux"): a word ends where no letter or digit follows.
const END = "(?![\\p{L}\\p{N}'’])";
const LEADING_AMOUNT = new RegExp(
  `^(?:(?:\\d+(?:[.,]\\d+)?|[½¼¾]|(?:${NUMBER_WORDS})${END})\\s*(?:(?:${UNIT_WORDS})${END}\\.?\\s*)?)?` +
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
  const term = piece.replace(LEADING_AMOUNT, '').trim();
  return term === '' ? piece : term;
}

/** A weight the person typed in grams ("150 g rice"), as a portion; `undefined` otherwise. */
function typedPortion(piece: string): QuantityRange | undefined {
  const m = GRAMS.exec(piece);
  const grams = m === null ? NaN : Number((m[1] ?? '').replace(',', '.'));
  if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) return undefined;
  return { low: 1, high: 1, unit: 'g', displayLabel: `${grams} g`, grams };
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
    const portion = typedPortion(piece) ?? top.presets[0];
    foods.push({
      databaseFood: top.food,
      confidence: top.confidence,
      quantity: portion ?? { low: 1, high: 1, unit: 'serving', displayLabel: '1 serving' },
    });
    closest.push(top, ...others.slice(0, 2));
  }
  return { result: recognizedPlate(foods), closestMatches: closest, unmatched };
}
