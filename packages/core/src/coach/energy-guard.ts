/**
 * The numeric guards of the AI output validator and of the on-device support routing: a daily
 * energy figure under the person's guide, a loss faster than a kilo a week, a fraction of the guide.
 *
 * STRUCTURAL, NOT A VERB LIST. Every energy figure F in the text (after normalisation: spelled-out
 * numbers, thousands forms, ranges, kilojoules divided by 4.184) with `300 <= F < threshold` is
 * unsafe unless the context clearly classifies it as one of three harmless things. When the context
 * cannot be classified the figure is REFUSED (fail closed). The threshold is the person's guide
 * (rounded to the nearest 100 kcal, because that is the figure the model is shown) or,
 * with no guide, their floor. A figure at or above the threshold is fine.
 *
 * The three harmless classes, each with an explicit window over the SENTENCE the figure is in
 * (sentences end at `. ? ! ;`, a decimal or thousands point does not end one):
 *
 *  (i)  ITEM: the energy of a named food, plate or meal, or of a single food per 100 g. It must
 *       read "<the/that/your ... thing> is/was/of/: about N kcal" (the text from the sentence start
 *       to the figure ends with a subject that is not a day, an intake, a guide, a target ...),
 *       or "N kcal in/from the pizza", "N kcal at lunch", "per 100 g". A figure for ONE meal is
 *       fine; "each meal / chaque repas" multiplied by the number of meals (default three) must
 *       reach the threshold; two or more meal figures in one sentence that add up to less than the
 *       threshold are refused ("300 kcal at breakfast, 300 at lunch, 300 at dinner").
 *  (ii) DIFFERENCE: a deficit, a saving, a "less than usual": the 24 characters before the figure
 *       hold deficit/surplus/difference/saves/reduce by/cut by/écart... with no "to/down to/at/on"
 *       between them and the figure, or the text right after the figure starts "less / fewer /
 *       moins". A stated DEFICIT above 1,100 kcal a day is a pace over a kilo a week: refused.
 *  (iii) DESCRIPTION of what was logged: a past or reporting word before the figure ("averaged",
 *       "intake today was", "you ate", "logged", "en moyenne", "faisait") and NO modal before it,
 *       and no instruction to keep / repeat / aim for it (keep, repeat, stay, aim, try, continue,
 *       same, again, like that, tomorrow, objectif, gardez, visez ...) in the same sentence or in
 *       the NEXT one.
 *
 * Whatever is not one of these, below the threshold, is refused: "Have 1100 kcal.", "Around 1,100
 * kcal would suit you.", "A day of 1100 kcal.".
 *
 * Like every check in this module this is a backstop of pattern and number checks. It cannot catch
 * every wording; the system prompt is the first layer and the built-in rules-based coach never
 * depends on it.
 */
import {
  energyFigures,
  numberOf,
  prepareText,
  scanNumbers,
  sentenceSpans,
  type EnergyFigure,
} from './text-prep';

export interface EnergyLimits {
  readonly floorKcal?: number;
  readonly guideKcal?: number;
}

/** Below this a figure is a snack or a drink, not a day. */
const STRUCTURAL_MIN_KCAL = 300;
/**
 * A deficit above this is more than the largest pace of the guide (ADR 0008: faster, -750 kcal a
 * day, about 0.7 kg a week). A text that states a bigger one is refused.
 */
const MAX_DEFICIT_KCAL = 750;

/** The lowest daily figure a text may state as something to eat. */
export function energyThreshold(limits: EnergyLimits): number {
  const floor = limits.floorKcal ?? 1200;
  // The model is shown the guide rounded to the nearest 100 kcal; that is the figure it may quote.
  return limits.guideKcal === undefined
    ? floor
    : Math.max(floor, Math.round(limits.guideKcal / 100) * 100);
}

const DAILY_AFTER =
  /^\s*(?:(?:about|around|environ)\s+)?(?:\/|\ba\b|\bper\b|\beach\b|\bevery\b|\bpar\b|\bchaque\b|\bpour\b)?\s*(?:day|jour|journee|daily|quotidien\w*|journalier\w*)\b/;
const DAILY_BEFORE =
  /\b(?:daily|quotidien\w*|journalier\w*)\b[^.?!;]{0,24}$|\b(?:per day|a day|par jour|chaque jour|each day|every day|tous les jours)\s*[:,(-]?\s*(?:about|around|environ|of)?\s*$/;

const MEALS =
  'meals?|breakfasts?|lunch(?:es)?|dinners?|suppers?|snacks?|repas|petits?-dejeuners?|dejeuners?|diners?|collations?|gouters?';

/** "each meal", "at every meal", "chaque repas", "à tous les repas", "par repas". */
const EACH_MEAL = new RegExp(
  `\\b(?:each|every|per|at all|at every|at each|chaque|a chaque|par|a tous les|tous les)\\s+(?:${MEALS}|sitting|time)\\b`,
);

const DIFF_TRIGGER =
  /\b(deficit|surplus|difference|gap|shortfall|add|adds|adding|added|extra|saves?|saved|saving|savings|reduction|reduces?|reduced|reducing|cut|cuts|cutting|trim|trims|trimming|lower|lowers|lowered|lowering|drop|drops|ecart|economis\w*|economie|reduire|reduisez|baisse|diminu\w*|retranch\w*|enleve\w*|retire\w*)\b([^.?!;]{0,24})$/;
const DIFF_BLOCKER = /\b(?:to|down|at|on|until|till|towards?|jusqu\w*|a|au|aux|sur|vers)\b/;
const DIFF_AFTER =
  /^\s*(?:a day |per day |each day |par jour |chaque jour |daily )?(?:less|fewer|lower|lighter|more|extra|moins|de moins|en moins|de plus|en plus|plus bas|plus leger)\b/;

const DESC_BEFORE =
  /\b(?:tournaient|tournait|oscill\w+|variaient|variait|se situaient|se situait|hovered|ranged|stayed|averag\w*|on average|en moyenne|moyenne|intake (?:today|yesterday|this week|so far)|apport (?:du jour|d'aujourd'hui|d'hier)|ate|eaten|logged|recorded|consumed|took in|came to|comes to|totall?ed|added up|adds up|amounted|summed up|reached|stood at|came in at|so far|jusqu'ici|until now|was|were|has been|have been|had|s'elevait|s'eleve|etait|etaient|faisait|a ete|ont ete|enregistre\w*|vous avez (?:mange|consomme|note)|j'ai (?:mange|note))\b/;
const MODAL =
  /\b(?:could|should|would|might|may|can|must|need|ought|pourriez|devriez|pouvez|devez|faut)\b/;
const INSTRUCT =
  /\b(?:keep|repeat|stay|stick|aim|target|try|continue|maintain|same|again|like that|like this|that way|go for|goal|tomorrow|demain|next time|gardez|reproduis\w*|continuez|visez|essayez|restez|refaites|meme|identique|comme ca|objectif|cible|should|devriez|keeping|repeating|going forward|from now on|desormais|dorenavant)\b/;

const NON_ITEM_HEAD =
  /^(?:day|days|week|weeks|intake|total|average|guide|target|goal|limit|budget|plan|diet|regimen|regime|ration|allowance|apport|repere|objectif|cible|journee|jour|jours|semaine|moyenne|energy|energie|calories?|today|menu|deficit|aujourd'hui|morning|evening|night|soir|matin)$/;

const DET_WORDS = new Set([
  'that',
  'this',
  'those',
  'these',
  'the',
  'a',
  'an',
  'your',
  'one',
  'each',
  'la',
  'le',
  'les',
  'cette',
  'ce',
  'cet',
  'un',
  'une',
  'votre',
  'ton',
  'ta',
  'mon',
]);
/** Words that may follow the subject of "<subject> is about N kcal" before the figure. */
const LINK_WORDS = new Set([
  'of',
  'de',
  "d'",
  'is',
  'was',
  'are',
  'were',
  'has',
  'had',
  'have',
  'comes',
  'come',
  'to',
  'came',
  'carries',
  'carry',
  'contains',
  'contain',
  'packs',
  'brings',
  'provides',
  'adds',
  'est',
  'etait',
  'sont',
  'faisait',
  'fait',
  'font',
  'contient',
  'apporte',
  'pese',
  'represente',
  'compte',
  'donne',
  '=',
  ':',
  'about',
  'around',
  'roughly',
  'nearly',
  'almost',
  'only',
  'just',
  'environ',
  'pres',
  'presque',
  'autour',
  'soit',
  'at',
  'with',
  'avec',
  'often',
  'usually',
  'typically',
  'generally',
  'easily',
  'already',
  'alone',
  'seul',
  'seule',
  'souvent',
  'facilement',
  'deja',
  'bien',
  'can',
  'may',
  'could',
  'will',
  'peut',
  'peuvent',
  'reach',
  'reaches',
  'atteindre',
  'atteint',
  'be',
  'etre',
  'approximately',
  'roughly',
]);
const PREPOSITIONS = new Set(['from', 'in', 'of', 'dans', 'de', 'avec', 'with', 'pour', 'for']);

/**
 * The thing a figure is the energy of, read from the words right before it: an optional
 * preposition, a determiner and one to three words that are not a day, an intake, a guide ... Link
 * words ("is", "of", "about", "faisait") between that subject and the figure are skipped.
 * "That sandwich is around", "a dinner of about", "from the pizza, about" are items; "your daily
 * intake was", "a day of", "the plan" are not.
 */
function itemSubject(before: string, needPreposition: boolean): boolean {
  const words = before
    .trim()
    .replace(/[,:]+$/, '')
    .split(/\s+/)
    .map((w) => w.replace(/[,:]+$/, ''))
    .filter((w) => w !== '');
  let popped = 0;
  while (words.length > 0 && LINK_WORDS.has(words[words.length - 1] ?? '')) {
    words.pop();
    popped++;
  }
  // "a strict 800 kcal week": a subject with no link word is not the thing the figure describes.
  if (popped === 0 && !/[,:]$/.test(before.trim())) return false;
  const tail = words.slice(-5);
  for (let d = tail.length - 1; d >= 0; d--) {
    const w = tail[d] ?? '';
    const elided = /^(?:l|d)'/.test(w);
    if (!DET_WORDS.has(w) && !elided) continue;
    if (needPreposition && !PREPOSITIONS.has(tail[d - 1] ?? '')) continue;
    const subject = [...(elided ? [w.slice(2)] : []), ...tail.slice(d + 1)].filter((x) => x !== '');
    if (subject.length === 0 || subject.length > 3) continue;
    return !subject.some((x) => NON_ITEM_HEAD.test(x));
  }
  // No determiner: "two eggs and toast come to about 350 kcal" (a count, then foods).
  const first = words[0] ?? '';
  if (!needPreposition && words.length >= 2 && words.length <= 6 && popped > 0) {
    const counted = /^\d+$/.test(first) || numberOf(first) !== null;
    if (counted && !words.some((x) => NON_ITEM_HEAD.test(x) || PRESCRIBE_VERB.test(x))) return true;
  }
  return false;
}

const ITEM_AFTER =
  /^\s*(?:in|dans|from|de|pour|for|per|par)\s+(?:(?:that|this|the|a|an|your|one|la|le|les|cette|ce|un|une|votre)\s+|l')([a-z'-]+)/;
const MEAL_AFTER = new RegExp(
  `^\\s*(?:at|for|au|pour|a|during|as)\\s+(?:the\\s+|your\\s+|le\\s+|votre\\s+)?(?:${MEALS})\\b`,
);
const MEAL_NEAR_BEFORE = new RegExp(
  `\\b(?:${MEALS}|plates?|assiettes?|portions?|servings?|slices?|parts?|tranches?|bowls?|bols?|recipes?|recettes?)\\s+(?:of |de |d'|at |a |with |avec |is |was |=|:|under |below |over |sous |moins de |up to |max |maximum )?\\s*(?:about |around |roughly |nearly |environ |soit )*$`,
);
const ITEM_NOUN_AFTER = new RegExp(
  `^\\s*(?:${MEALS}|plates?|assiettes?|portions?|servings?|slices?|recipes?|recettes?|bars?|pizzas?|burgers?|sandwich\\w*)\\b`,
);
const PER_PORTION =
  /\b(?:per|par|pour|for) (?:100\s?g|100\s?ml|serving|portion|slice|part|tranche|piece|unit|unite)\b|\/100\s?g|\b100\s?g\b/;

function sentenceAt(spans: { start: number; end: number }[], pos: number): number {
  const i = spans.findIndex((s) => pos >= s.start && pos <= s.end);
  return i < 0 ? spans.length - 1 : i;
}

const DEFICIT_WORDS = new Set(['deficit', 'gap', 'shortfall', 'ecart']);
const CUT_WORDS = new Set([
  'cut',
  'cuts',
  'cutting',
  'trim',
  'trims',
  'trimming',
  'lower',
  'lowers',
  'lowered',
  'lowering',
  'reduces',
  'reduce',
  'reduced',
  'reducing',
  'reduire',
  'reduisez',
  'baisse',
  'retranch',
]);
const DAILY_FRAME =
  /\b(?:a day|per day|each day|every day|daily|par jour|chaque jour|tous les jours)\b/;

function isDifference(
  before: string,
  after: string,
  sentence: string,
): { diff: boolean; deficit: boolean } {
  if (DIFF_AFTER.test(after)) return { diff: true, deficit: false };
  // The upper end of a range ("250 to 500") is read from before the range.
  const m = DIFF_TRIGGER.exec(
    before.replace(/[\d.,]+\s*(?:to|-|a|and|et|or|ou)\s*$/, '').slice(-70),
  );
  if (m === null) return { diff: false, deficit: false };
  if (DIFF_BLOCKER.test(m[2] ?? '')) return { diff: false, deficit: false };
  const word = m[1] ?? '';
  const cutDaily =
    (CUT_WORDS.has(word) || word.startsWith('retranch')) && DAILY_FRAME.test(sentence);
  return { diff: true, deficit: DEFICIT_WORDS.has(word) || cutDaily };
}

const DESC_PERIOD =
  /\b(?:this week|cette semaine|aujourd'hui|today|hier|yesterday|ces \d+ jours|these \d+ days|the last|the past|sur les|over the (?:last|past)|jusqu'ici|so far)\b/;
const PRESCRIBE_VERB =
  /\b(?:eat|have|aim|try|keep|stay|limit|consume|go for|mangez|visez|essayez|gardez|restez|limitez|prenez|buvez)\b/;

function isDescriptive(before: string, sentence: string, next: string): boolean {
  return (
    (DESC_BEFORE.test(before) || (DESC_PERIOD.test(before) && !PRESCRIBE_VERB.test(before))) &&
    !MODAL.test(before) &&
    !INSTRUCT.test(sentence) &&
    !INSTRUCT.test(next)
  );
}

const GUIDE_WORD = /\b(?:guide|repere)\b/;

const NON_ITEM_AFTER =
  /^\s*(?:(?:meal|diet|eating|food|menu|repas|regime)[- ]?(?:plans?|programs?|programmes?|menus?|charts?)|plan repas|day|days|week|weeks|diet|diets|plan|plans|regime|regimes|menu|menus|program|programme|cleanse|challenge|jour|jours|semaine|semaines|journee|journees)\b/;

function isItem(before: string, after: string, sentence: string): boolean {
  if (NON_ITEM_AFTER.test(after)) return false;
  if (PER_PORTION.test(sentence)) return true;
  if (MEAL_NEAR_BEFORE.test(before)) return true;
  if (itemSubject(before, false) || itemSubject(before, true)) return true;
  const a = ITEM_AFTER.exec(after);
  if (a !== null && !NON_ITEM_HEAD.test(a[1] ?? '')) return true;
  return MEAL_AFTER.test(after) || ITEM_NOUN_AFTER.test(after);
}

/** How many meals "each meal" is read as: a number next to "meals" in the sentence, else three. */
function mealCount(sentence: string): number {
  const m = new RegExp(`\\b([a-z0-9-]+)\\s+(?:${MEALS})\\b`).exec(sentence);
  const n = m === null ? null : numberOf(m[1] ?? '');
  return n !== null && n >= 2 && n <= 8 ? n : 3;
}

const FRACTION_WORDS =
  '(?:half|halve[sd]?|a third|one third|a quarter|one quarter|two thirds|three quarters|a fifth|la moitie|le tiers|le quart|un tiers|un quart|les deux tiers|moitie)';
const OF_GUIDE =
  '(?:your|the|votre|ton|le|la)\\s+(?:daily\\s+|quotidien\\s+)?(?:guide|repere|intake|apport|target|goal|objectif|calories|ration)';
const FRACTION_PATTERNS: readonly RegExp[] = [
  new RegExp(`\\b${FRACTION_WORDS}\\b[^.?!;]{0,16}?\\b(?:of )?(?:de |d')?${OF_GUIDE}`),
  new RegExp(
    `\\b(?:cut|halve|reduce|divide|slash|shrink|reduisez|divisez|coupez|diminuez|baissez)\\b[^.?!;]{0,30}\\b(?:guide|repere|intake|apport)\\b[^.?!;]{0,20}\\b(?:in half|by half|by (?:a )?(?:third|quarter|half)|par deux|de moitie|en deux|en moitie)\\b`,
  ),
  new RegExp(`\\bhalve (?:your |the |votre )?(?:guide|repere|intake|apport)\\b`),
];
const PRESCRIBE =
  /\b(?:eat|have|aim|keep|try|cut|halve|stay|consume|limit|go|mangez|visez|reduisez|limitez|gardez|essayez|coupez|divisez|prenez)\b/;

/**
 * A fraction of the guide stated as a target: "half of your guide", "cut your guide in half", "la
 * moitié de votre repère", or "60 % of your guide" with an eating verb in the sentence. A sentence
 * that only says what share a plate or a meal is ("that pizza is half of your guide") is fine.
 */
export function hasGuideFraction(f: string): boolean {
  for (const s of sentenceSpans(f)) {
    const sentence = f.slice(s.start, s.end);
    let hit = FRACTION_PATTERNS.some((p) => p.test(sentence));
    if (!hit && PRESCRIBE.test(sentence)) {
      for (const n of scanNumbers(sentence)) {
        const rest = sentence.slice(n.end, n.end + 40);
        if (n.value < 100 && new RegExp(`^\\s*%\\s*(?:of |de |du )?\\s*${OF_GUIDE}`).test(rest)) {
          hit = true;
        }
      }
    }
    if (!hit) continue;
    const itemShare =
      !PRESCRIBE.test(sentence) &&
      (DESC_BEFORE.test(sentence) ||
        DESC_PERIOD.test(sentence) ||
        new RegExp(
          `\\b(?:${MEALS}|plates?|assiettes?|portions?|slices?|pizza|burger|sandwich)\\b`,
        ).test(sentence));
    if (!itemShare) return true;
  }
  return false;
}

/**
 * A typed QUESTION that asks for a very low daily intake ("is 600 kcal enough for a day", "meal plan
 * 1000 kcal", "est-ce que 1000 kcal c'est assez", "3500 kJ a day"): an energy figure from 150 to
 * 1,199 kcal that is NOT the energy of an item ("a dinner of 600 kcal", "a 500 kcal lunch",
 * "recette à 800 kcal"). No daily or request frame is needed: the bar for an ask is lower than for
 * an output, because a question is only routed to calm support copy. Uses the validator's number reading
 * (spelled-out numbers, kilojoules, ranges).
 */
export function askEatsVeryLittle(f: string): boolean {
  const spans = sentenceSpans(f);
  for (const fig of energyFigures(f)) {
    if (fig.kcal < 150 || fig.kcal >= 1200) continue;
    const si = sentenceAt(spans, fig.start);
    const s = spans[si] ?? { start: 0, end: f.length };
    const sentence = f.slice(s.start, s.end);
    const before = f.slice(s.start, fig.start);
    const after = f.slice(fig.ctxEnd, s.end);
    if (isItem(before, after, sentence)) continue;
    // The lower bar of an ask: any figure under the floor (1,200 and above is the floor itself, not below it) that is not one food or one plate
    // routes, with or without "a day" or an eating verb around it.
    return true;
  }
  return false;
}

/** A bare figure next to "a day" with an eating verb before it: "Eat 1,100 a day." */
function bareDailyUnsafe(f: string, threshold: number, covered: EnergyFigure[]): boolean {
  for (const n of scanNumbers(f)) {
    if (n.spelled || n.value < STRUCTURAL_MIN_KCAL || n.value >= threshold) continue;
    if (covered.some((c) => c.start <= n.start && n.start < c.end)) continue;
    const after = f.slice(n.end, n.end + 24);
    if (!/^\s*(?:a day|per day|daily|par jour|\/day|\/jour|chaque jour|each day)\b/.test(after)) {
      continue;
    }
    if (
      /^\s*(?:kg|g|mg|steps?|pas|min|minutes?|hours?|heures?|%)/.test(f.slice(n.end, n.end + 8))
    ) {
      continue;
    }
    const before = f.slice(Math.max(0, n.start - 40), n.start);
    if (
      /\b(?:eat|eating|have|aim|target|consume|manger|mangez|visez|limit\w*|stay|keep)\b/.test(
        before,
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True when the text puts a daily energy figure under the person's guide (or floor) as something to
 * eat, or states a fraction of the guide. See the module header for the three classes of figure
 * that are allowed and the context windows each one reads.
 */
export function hasUnsafeEnergyFigure(text: string, limits: EnergyLimits = {}): boolean {
  const { f } = prepareText(text);
  return unsafeEnergyIn(f, limits);
}

export function unsafeEnergyIn(f: string, limits: EnergyLimits = {}): boolean {
  const threshold = energyThreshold(limits);
  const spans = sentenceSpans(f);
  const figures = energyFigures(f);
  const itemFigures = new Map<number, number[]>();
  if (hasGuideFraction(f)) return true;
  for (const fig of figures) {
    if (fig.kcal < 100) continue;
    const si = sentenceAt(spans, fig.start);
    const s = spans[si] ?? { start: 0, end: f.length };
    const sentence = f.slice(s.start, s.end);
    const before = f.slice(s.start, fig.start);
    const after = f.slice(fig.ctxEnd, s.end);
    const nextSpan = spans[si + 1];
    const next = nextSpan === undefined ? '' : f.slice(nextSpan.start, nextSpan.end);
    const diff = isDifference(before, after, sentence);
    if (diff.diff) {
      if (diff.deficit && fig.kcal > MAX_DEFICIT_KCAL) return true;
      // A deficit anchored to the guide may not take the day below the floor.
      if (diff.deficit && GUIDE_WORD.test(sentence) && limits.guideKcal !== undefined) {
        const guide = Math.round(limits.guideKcal / 100) * 100;
        if (guide - fig.kcal < (limits.floorKcal ?? 1200)) return true;
      }
      continue;
    }
    const desc = isDescriptive(before, sentence, next);
    if (desc) continue;
    if (EACH_MEAL.test(sentence)) {
      // A prescribed per-meal figure: over the meals of a day it must reach the threshold.
      if (fig.kcal * mealCount(sentence) < threshold) return true;
      continue;
    }
    if (fig.kcal >= threshold) continue;
    const daily = DAILY_AFTER.test(after) || DAILY_BEFORE.test(before);
    if (fig.kcal < STRUCTURAL_MIN_KCAL && !daily) continue;
    if (isItem(before, after, sentence)) {
      const list = itemFigures.get(si) ?? [];
      list.push(fig.kcal);
      itemFigures.set(si, list);
      continue;
    }
    return true;
  }
  for (const [si, list] of itemFigures) {
    if (list.length < 2) continue;
    const s = spans[si] ?? { start: 0, end: f.length };
    const sentence = f.slice(s.start, s.end);
    const total = list.reduce((a, b) => a + b, 0);
    const meals = new Set(sentence.match(new RegExp(`\\b(?:${MEALS})\\b`, 'g')) ?? []);
    if (total < threshold && (meals.size >= 2 || /\b(?:day|daily|jour|journee)\b/.test(sentence))) {
      return true;
    }
  }
  if (mealListUnsafe(f, spans, threshold)) return true;
  return bareDailyUnsafe(f, threshold, figures);
}

const MEAL_THEN_NUMBER = new RegExp(
  `\\b(?:${MEALS})\\b\\s*(?:of|de|d'|at|:|=|-)?\\s*(\\d{2,4})(?![\\d.,]*\\s?(?:g|kg|ml|h|%|am|pm|min))`,
  'g',
);
const ANY_ENERGY_UNIT = /\b(?:kcals?|kilocalor\w*|calor\w*|kj|kilojoules?)\b/;

/**
 * A list of meals where only one figure (often the last) carries the unit: "breakfast 200, lunch
 * 350, dinner 400 kcal". The figures are summed; under the threshold, as a plan and not as a
 * description of what was logged, it is refused.
 */
function mealListUnsafe(
  f: string,
  spans: { start: number; end: number }[],
  threshold: number,
): boolean {
  for (const [si, s] of spans.entries()) {
    const sentence = f.slice(s.start, s.end);
    if (!ANY_ENERGY_UNIT.test(sentence)) continue;
    const hits = [...sentence.matchAll(MEAL_THEN_NUMBER)];
    if (hits.length < 2) continue;
    const factor = /\b(?:kj|kilojoules?)\b/.test(sentence) ? 1 / 4.184 : 1;
    const total = hits.reduce((sum, m) => sum + Number(m[1]) * factor, 0);
    if (total >= threshold) continue;
    const nextSpan = spans[si + 1];
    const next = nextSpan === undefined ? '' : f.slice(nextSpan.start, nextSpan.end);
    const before = sentence.slice(0, hits[0]?.index ?? 0);
    if (isDescriptive(before, sentence, next)) continue;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------------------------

const LOSS_CONTEXT =
  /\b(?:los(?:e|es|ing|t)|loss|drop(?:s|ping|ped)?|shed(?:s|ding)?|burn(?:ing)? off|perdre|perdez|perdu\w*|perte|maigrir|maigri\w*|descendre|minus|off|lighter|lower|plus leger\w*|de moins|en moins|fondre|melt)\b/;

const WEIGHT_UNIT =
  /^\s*(?:(?:last|final|more|extra|additional|derniers?|autres|de plus|en plus)\s+)?(kg|kgs|kilos?|kilograms?|kilogrammes?|lbs?|pounds?|livres?|stones?)\b/;
const ARTICLE_AMOUNT =
  /\b(half an?\s+|an?\s+half[- ]|un\s+demi[- ]|demi[- ]|an?\s+|un\s+|une\s+)(kilos?|kilograms?|kilogrammes?|pounds?)\b/g;

interface Amount {
  readonly kg: number;
  readonly start: number;
  readonly end: number;
}

function toKg(value: number, unit: string): number {
  if (/^(?:lbs?|pounds?|livres?)$/.test(unit)) return value * 0.4536;
  if (unit === 'stone' || unit === 'stones') return value * 6.35;
  return value;
}

function weightAmounts(sentence: string): Amount[] {
  const out: Amount[] = [];
  for (const n of scanNumbers(sentence)) {
    const m = WEIGHT_UNIT.exec(sentence.slice(n.end, n.end + 14));
    if (m !== null) {
      out.push({ kg: toKg(n.value, m[1] ?? 'kg'), start: n.start, end: n.end + m[0].length });
    }
  }
  for (const m of sentence.matchAll(ARTICLE_AMOUNT)) {
    const lead = (m[1] ?? '').trim();
    const half = /half|demi/.test(lead);
    const unit = m[2] ?? 'kilo';
    const covered = out.some(
      (o) => (m.index ?? 0) < o.end && o.end <= (m.index ?? 0) + m[0].length,
    );
    if (covered) continue;
    out.push({
      kg: toKg(half ? 0.5 : 1, unit),
      start: m.index ?? 0,
      end: (m.index ?? 0) + m[0].length,
    });
  }
  return out;
}

const UNIT_WEEKS: Readonly<Record<string, number>> = {
  day: 1 / 7,
  days: 1 / 7,
  jour: 1 / 7,
  jours: 1 / 7,
  night: 1 / 7,
  nights: 1 / 7,
  nuit: 1 / 7,
  nuits: 1 / 7,
  week: 1,
  weeks: 1,
  semaine: 1,
  semaines: 1,
  weekend: 1 / 3.5,
  month: 4.33,
  months: 4.33,
  mois: 4.33,
  year: 52,
  years: 52,
  an: 52,
  ans: 52,
  annee: 52,
  annees: 52,
};
const UNIT_RE =
  '(day|days|jour|jours|night|nights|nuits?|week|weeks|semaines?|weekend|months?|mois|years?|ans?|annees?)';
const PER_RE = new RegExp(
  `\\b(?:a|an|per|each|every|par|chaque|tous les|toutes les|/)\\s*((?:[a-z0-9-]+\\s+)?)${UNIT_RE}\\b`,
);
const WITHIN_RE = new RegExp(
  `\\b(?:in|over|within|during|for|across|en|sur|pendant|dans|d'ici|en l'espace de)\\s+(?:just |only |the next |the first |les |seulement )?((?:[a-z0-9-]+\\s+){0,2}?)${UNIT_RE}\\b`,
);
const ADVERB_RE = /\b(weekly|daily|monthly|hebdomadaires?|quotidien\w*|mensuel\w*|hebdo)\b/;
const OVERNIGHT_RE = /\b(?:overnight|du jour au lendemain|in no time|d'un jour a l'autre)\b/;
const DEADLINE_RE =
  /\b(?:by|before|until|till|avant|d'ici|pour (?:le|la|les|ce|cette|mon|ma|mes)|jusqu'a|jusqu'au)\s+(?:the |this |next |le |la |l'|ce |cette |mon |ma |my |our |notre )?([a-z' -]{2,40})/;
const SOON_DEADLINES =
  /^(?:(?:next|this|la|cette|prochaine)\s+)?(?:week|semaine|tomorrow|demain|tonight|ce soir|today|aujourd'hui|weekend|week-end|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaine prochaine|end of the week|fin de la semaine)\b/;
const MONTH_DEADLINES =
  /^(?:(?:next|the end of the|end of the|le|fin du|le mois|prochain)\s+)*(?:month|mois)\b|^(?:end of (?:the )?month|fin du mois|mois prochain)/;
const YEAR_DEADLINES = /\b(?:year|annee|ans?)\b/;

export interface PaceReading {
  /** The fastest loss stated, kilos a week, or `null` when none is stated. */
  readonly perWeek: number | null;
  /** An amount and a deadline appear but the rate cannot be computed. */
  readonly unknownDeadline: boolean;
}

/**
 * The loss rates a text states, in kilos a week: "6 kg in three weeks", "a kilo a day", "two kilos
 * every week", "1.5 kg weekly", "5 kg by next week", "4 kilos before Saturday", "10 pounds in 10
 * days". Count words and spelled-out numbers are read; pounds and stones are converted. A loss
 * verb (or "off", "lighter", "de moins") must be in the same sentence. When an amount comes with a
 * deadline ("by June", "before my wedding") whose length is unknown, `unknownDeadline` is set.
 */
export function readLossPace(f: string): PaceReading {
  let worst: number | null = null;
  let unknown = false;
  for (const s of sentenceSpans(f)) {
    const sentence = f.slice(s.start, s.end);
    if (!LOSS_CONTEXT.test(sentence)) continue;
    const amounts = weightAmounts(sentence).sort((x, y) => x.start - y.start);
    for (const [ai, a] of amounts.entries()) {
      // A time phrase belongs to the amount before it: stop at the next amount.
      const nextStart = amounts[ai + 1]?.start ?? sentence.length;
      const rest = sentence.slice(a.end, Math.min(a.end + 56, Math.max(a.end, nextStart)));
      let weeks: number | null = null;
      const per = PER_RE.exec(rest);
      const within = WITHIN_RE.exec(rest);
      const adverb = ADVERB_RE.exec(rest);
      const take = (m: RegExpExecArray | null): number | null => {
        if (m === null) return null;
        const unit = m[2] ?? '';
        const group = (m[1] ?? '')
          .replace(
            /\b(?:about|around|roughly|approximately|just|only|some|environ|a peu pres|pres de|seulement)\b/g,
            ' ',
          )
          .trim();
        const count = group === '' ? 1 : numberOf(group);
        const w = UNIT_WEEKS[unit];
        if (w === undefined) return null;
        return (count ?? 1) * w;
      };
      if (per !== null && (within === null || per.index <= within.index)) weeks = take(per);
      else if (within !== null) weeks = take(within);
      else if (adverb !== null) {
        const w = adverb[1] ?? '';
        weeks = /^(?:daily|quotidien)/.test(w) ? 1 / 7 : /^(?:monthly|mensuel)/.test(w) ? 4.33 : 1;
      } else if (OVERNIGHT_RE.test(rest)) weeks = 1 / 7;
      else {
        const d = DEADLINE_RE.exec(rest);
        if (d !== null) {
          const what = (d[1] ?? '').trim();
          if (SOON_DEADLINES.test(what)) weeks = 1;
          else if (MONTH_DEADLINES.test(what)) weeks = 4.33;
          else if (YEAR_DEADLINES.test(what)) weeks = 52;
          else unknown = true;
        }
      }
      if (weeks !== null && weeks > 0) {
        const rate = a.kg / weeks;
        worst = worst === null ? rate : Math.max(worst, rate);
      }
    }
  }
  return { perWeek: worst, unknownDeadline: unknown };
}

/** The fastest loss a coach text may state, kilos a week (the guide's own ceiling is 1 % a week). */
export const MAX_SAFE_LOSS_KG_PER_WEEK = 1;

/**
 * The kilos per week a loss is said to take; `null` when the text states none. Pounds are
 * converted.
 */
export function statedLossPerWeek(text: string): number | null {
  return readLossPace(prepareText(text).f).perWeek;
}

export function exceedsSafePaceIn(f: string): boolean {
  const r = readLossPace(f);
  return r.unknownDeadline || (r.perWeek !== null && r.perWeek > MAX_SAFE_LOSS_KG_PER_WEEK + 1e-9);
}

/** True when the text states a loss faster than `MAX_SAFE_LOSS_KG_PER_WEEK`, or a deadline it cannot size. */
export function exceedsSafePace(text: string): boolean {
  return exceedsSafePaceIn(prepareText(text).f);
}
