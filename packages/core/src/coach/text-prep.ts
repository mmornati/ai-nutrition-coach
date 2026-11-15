/**
 * Text preparation shared by the AI output validator and the on-device support routing
 * (`ai-coaching.ts`): normalisation, look-alike detection and number reading.
 *
 * Pure and fast: no network, no model, no clock. Everything here is a PATTERN-LEVEL aid. It makes a
 * phrase list harder to slip past (invisible characters, full-width letters, spaced-out letters,
 * spelled-out numbers, kilojoules, ranges); it cannot understand a sentence.
 */

const DIGIT_ZEROS = [
  0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xe50, 0xed0, 0xf20,
  0x1040, 0x17e0, 0x1810,
];

function asciiDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 128) return ch;
    for (const zero of DIGIT_ZEROS) if (cp >= zero && cp < zero + 10) return String(cp - zero);
    return ch;
  });
}

/**
 * NFKC, no invisible format characters (zero-width, bidi marks, soft hyphen), no line or paragraph
 * separators, no control characters, variation selectors removed, non-ASCII digits turned into
 * ASCII digits. This is what every check reads.
 */
const LINE_SEPARATORS = new RegExp(
  `[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`,
  'g',
);
const VARIATION_SELECTORS = new RegExp(
  `[${String.fromCharCode(0xfe00)}-${String.fromCharCode(0xfe0f)}]`,
  'g',
);
const CONTROL_CHARS = /\p{Cc}/gu;

export function normaliseText(raw: string): string {
  return asciiDigits(
    raw
      .normalize('NFKC')
      .replace(LINE_SEPARATORS, '\n')
      .replace(/\p{Cf}/gu, '')
      .replace(VARIATION_SELECTORS, '')
      .replace(CONTROL_CHARS, (c) => (c === '\n' || c === '\t' || c === '\r' ? c : ' ')),
  );
}

/**
 * True when a word mixes Latin letters with Cyrillic or Greek ones: a look-alike spelling ("fаsting"
 * with a Cyrillic "а") that a phrase list would never match. Such a text is refused outright. The
 * micro sign (a Greek mu after NFKC) next to Latin letters ("µg") is a unit, not a look-alike.
 */
export function hasMixedScriptWord(norm: string): boolean {
  for (const m of norm.matchAll(/[\p{L}\p{M}]+/gu)) {
    const w = m[0];
    if (!/\p{Script=Latin}/u.test(w)) continue;
    if (!/[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(w)) continue;
    if (/^μ\p{Script=Latin}{1,2}$/u.test(w)) continue;
    return true;
  }
  return false;
}

/** Letters separated by single spaces, dots or dashes: "s k i p", "s.k.i.p" become "skip". */
function collapseSpacedLetters(text: string): string {
  return text.replace(/(?<![\p{L}\p{N}])(?:\p{L}[ .\-_*·•]){2,}\p{L}(?![\p{L}\p{N}])/gu, (run) =>
    run.replace(/[ .\-_*·•]/g, ''),
  );
}

/** The forms a text is matched in. */
export interface Prepared {
  /** Normalised, original case and accents (what is shown). */
  readonly norm: string;
  /**
   * Lower-case, accents removed, apostrophes and dashes straightened, spaced-out letters joined.
   * "jeûne" (fast) is written "jeuxne" here because "jeune" alone means "young".
   */
  readonly f: string;
}

/** Lower-case, accent-free, straight apostrophes and ASCII dashes (see `Prepared.f`). */
export function foldText(norm: string): string {
  const lower = norm
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/[«»“”"]/g, ' ')
    .replace(/jeûn/g, 'jeuxn');
  return collapseSpacedLetters(lower.normalize('NFD').replace(/\p{M}/gu, ''));
}

export function prepareText(raw: string): Prepared {
  const norm = normaliseText(raw);
  return { norm, f: foldText(norm) };
}

/** The sentences of a folded text (a decimal point or a thousands dot does not end one). */
export function sentenceSpans(f: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let start = 0;
  for (const m of f.matchAll(/[?!;\n]|\.(?!\d)/g)) {
    const end = m.index ?? 0;
    spans.push({ start, end });
    start = end + 1;
  }
  spans.push({ start, end: f.length });
  return spans.filter((s) => s.end > s.start || spans.length === 1);
}

// ---------------------------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------------------------

/** A number read from the text: digits ("1 200", "1,200", "1.200", "1.5") or words. */
export interface NumberToken {
  readonly value: number;
  readonly start: number;
  readonly end: number;
  readonly spelled: boolean;
}

const UNITS: Readonly<Record<string, number>> = {
  zero: 0,
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
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  // French.
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
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
  vingts: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
};
const HUNDREDS = new Set(['hundred', 'cent', 'cents']);
const THOUSANDS = new Set(['thousand', 'mille', 'milles']);
const CONNECTORS = new Set(['and', 'et']);

const isNumberWord = (w: string): boolean => w in UNITS || HUNDREDS.has(w) || THOUSANDS.has(w);

/** Number words in runs: "twelve hundred", "mille deux cents", "quatre-vingt-dix", "a thousand". */
function spelledNumbers(f: string): NumberToken[] {
  const words = [...f.matchAll(/[a-z]+/g)].map((m) => ({
    w: m[0],
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  const out: NumberToken[] = [];
  let i = 0;
  while (i < words.length) {
    const first = words[i];
    if (first === undefined) break;
    const next = words[i + 1];
    const article =
      (first.w === 'a' || first.w === 'an') &&
      next !== undefined &&
      (HUNDREDS.has(next.w) || THOUSANDS.has(next.w)) &&
      /^\s+$/.test(f.slice(first.end, next.start));
    if (!isNumberWord(first.w) && !article) {
      i++;
      continue;
    }
    let total = 0;
    let cur = 0;
    let prev = '';
    let last = first;
    let j = i;
    for (; j < words.length; j++) {
      const t = words[j];
      if (t === undefined) break;
      if (j > i) {
        const gap = f.slice((words[j - 1] ?? t).end, t.start);
        if (!/^[ -]+$/.test(gap)) break;
      }
      const w = t.w;
      if (j === i && article) {
        cur = 1;
        prev = w;
        last = t;
        continue;
      }
      if (CONNECTORS.has(w)) {
        const nxt = words[j + 1];
        if (nxt !== undefined && isNumberWord(nxt.w) && j > i) {
          prev = w;
          continue;
        }
        break;
      }
      if (!isNumberWord(w)) break;
      if (HUNDREDS.has(w)) cur = (cur === 0 ? 1 : cur) * 100;
      else if (THOUSANDS.has(w)) {
        total += (cur === 0 ? 1 : cur) * 1000;
        cur = 0;
      } else if ((w === 'vingt' || w === 'vingts') && prev === 'quatre') cur += 76;
      else cur += UNITS[w] ?? 0;
      prev = w;
      last = t;
    }
    out.push({ value: total + cur, start: first.start, end: last.end, spelled: true });
    i = Math.max(j, i + 1);
  }
  return out;
}

const WEIGHT_UNIT_AHEAD =
  /^\s*(?:kg|kgs|kilos?|kilograms?|kilogrammes?|g|grams?|grammes?|lbs?|pounds?|livres?)\b/;

/** Digit numbers: "1 200", "1,200", "1.200" (thousands), "1.5" and "1,5" (decimals), "1.2k". */
function digitNumbers(f: string): NumberToken[] {
  const out: NumberToken[] = [];
  const re = /(?<![\p{L}\p{N}.,])(\d{1,3}(?:[ ,.]\d{3})+(?!\d)|\d+(?:[.,]\d+)?)/gu;
  for (const m of f.matchAll(re)) {
    const raw = m[1] ?? '';
    const start = m.index ?? 0;
    let end = start + raw.length;
    const ahead = f.slice(end);
    let value: number;
    if (/^\d{1,3}[.,]\d{3}$/.test(raw) && WEIGHT_UNIT_AHEAD.test(ahead)) {
      value = Number(raw.replace(',', '.'));
    } else if (/^\d+[.,]\d+$/.test(raw) && !/^\d{1,3}[.,]\d{3}$/.test(raw)) {
      value = Number(raw.replace(',', '.'));
    } else {
      value = Number(raw.replace(/[ ,.]/g, ''));
    }
    const mult = /^\s?(thousand|mille|k(?![a-z])|hundred|cents?)\b/.exec(ahead);
    if (mult !== null) {
      const word = mult[1] ?? '';
      value *= word === 'hundred' || word.startsWith('cent') ? 100 : 1000;
      end += mult[0].length;
    }
    if (Number.isFinite(value)) out.push({ value, start, end, spelled: false });
  }
  return out;
}

/** Every number in a folded text, in order of position. */
export function scanNumbers(f: string): NumberToken[] {
  const digits = digitNumbers(f);
  const words = spelledNumbers(f).filter(
    (w) => !digits.some((d) => d.start < w.end && w.start < d.end),
  );
  return [...digits, ...words].sort((a, b) => a.start - b.start);
}

/** The value of a short phrase that is a number ("three", "12", "a few" = 3), or `null`. */
export function numberOf(phrase: string): number | null {
  const p = phrase.trim();
  if (/^(?:an?|one|un|une|the)$/.test(p)) return 1;
  if (/^(?:a few|few|quelques)$/.test(p)) return 3;
  const tokens = scanNumbers(p);
  const t = tokens[0];
  return t !== undefined && t.start === 0 && t.end === p.length ? t.value : null;
}

const ENERGY_UNIT = /^\s{0,2}(kcals?|kilocalor\w*|calor\w*|cals?|kj|kilojoules?)(?![a-z])/;

/** The energy unit right after a position, as a factor to kcal, or `null`. */
export function energyUnitAfter(f: string, end: number): { factor: number; end: number } | null {
  const m = ENERGY_UNIT.exec(f.slice(end, end + 18));
  if (m === null) return null;
  const unit = m[1] ?? '';
  const kj = unit === 'kj' || unit.startsWith('kilojoule');
  return { factor: kj ? 1 / 4.184 : 1, end: end + m[0].length };
}

export interface EnergyFigure {
  /** Kilocalories (kilojoules divided by 4.184). */
  readonly kcal: number;
  readonly start: number;
  readonly end: number;
  /** Where the text AFTER this figure begins: the end of the whole range for its lower end. */
  readonly ctxEnd: number;
  readonly spelled: boolean;
}

const RANGE_GAP = /^\s*(?:-|to|a|and|et|or|ou|through)\s*$/;

/**
 * Every energy figure in a folded text, in kilocalories: "1,200 kcal", "1.200 kcal", "1 200 kcal",
 * "a thousand calories", "twelve hundred calories", "mille deux cents kcal", "3500 kJ" (= 837 kcal).
 * Both ends of a range ("900-1100 kcal", "900 à 1100 kcal", "900 to 1100 kcal") are figures.
 */
export function energyFigures(f: string): EnergyFigure[] {
  const nums = scanNumbers(f);
  const found: (EnergyFigure | null)[] = nums.map((n) => {
    const u = energyUnitAfter(f, n.end);
    return u === null
      ? null
      : { kcal: n.value * u.factor, start: n.start, end: u.end, ctxEnd: u.end, spelled: n.spelled };
  });
  for (let i = nums.length - 2; i >= 0; i--) {
    const here = nums[i];
    const nxt = nums[i + 1];
    const after = found[i + 1];
    if (here === undefined || nxt === undefined || found[i] !== null || after === null) continue;
    if (after === undefined) continue;
    if (!RANGE_GAP.test(f.slice(here.end, nxt.start))) continue;
    const u = energyUnitAfter(f, nxt.end);
    if (u === null) continue;
    found[i] = {
      kcal: here.value * u.factor,
      start: here.start,
      end: here.end,
      ctxEnd: after.ctxEnd,
      spelled: here.spelled,
    };
  }
  return found.filter((x): x is EnergyFigure => x !== null);
}
