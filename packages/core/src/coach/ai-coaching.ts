/**
 * The pure rules around an AI-written coach text (docs/ai-tiers.md, "Coaching"): the output
 * contract, the validator every AI text passes before it is shown, and the local check that routes
 * a worry about food or health to a calm support line BEFORE anything is sent to an AI.
 *
 * Nothing here knows about a network, a model or a screen. An AI text is untrusted input: it is
 * shown only if it passes `validateCoachText`, otherwise the caller falls back to the template
 * coach (a note) or says so calmly (a chat).
 */
import { splitQuestionKey, withQuestionParams } from '../value-types/composition-pattern';

/** The ceilings of each AI text. */
export const COACH_LIMITS = Object.freeze({
  /** One coach note under a plate. */
  noteChars: 280,
  /** The optional follow-up question stored with a note. */
  followUpChars: 160,
  /** One answer in "Ask the coach". */
  answerChars: 800,
  /** The AI paragraph under the weekly review. */
  weekChars: 600,
  /** One question typed in "Ask the coach". */
  inputChars: 500,
  /** Questions in one conversation. */
  chatTurns: 6,
  /** A note must arrive within this long, or the template note stays. */
  noteTimeoutMs: 8000,
});

/**
 * How an AI-written note is stored without a schema change: an ordinary `CoachNote` row whose
 * `questionKey` is one of these bases (there is no copy under them, so the stored `text` is what is
 * shown) and whose `text` is the validated AI text. The follow-up is a second row. The language the
 * text was written in rides in the key's query string (`post.resolve.ai?lang=fr`).
 */
export const AI_NOTE_QUESTION_KEY = 'post.resolve.ai';
export const AI_FOLLOW_UP_QUESTION_KEY = 'depth.followUp.ai';

/** The stored key of an AI note or follow-up written in `locale`. */
export const aiQuestionKey = (base: string, locale: 'en' | 'fr'): string =>
  withQuestionParams(base, { lang: locale });

/** True for a note row written by the AI coach (see `AI_NOTE_QUESTION_KEY`). */
export const isAiCoachNote = (note: { readonly questionKey: string }): boolean => {
  const { base } = splitQuestionKey(note.questionKey);
  return base === AI_NOTE_QUESTION_KEY || base === AI_FOLLOW_UP_QUESTION_KEY;
};

/** The language an AI note was written in, or `null` when the key does not say. */
export function aiNoteLocale(note: { readonly questionKey: string }): 'en' | 'fr' | null {
  const lang = splitQuestionKey(note.questionKey).params['lang'];
  return lang === 'en' || lang === 'fr' ? lang : null;
}

export type CoachTextProblem =
  | 'empty'
  | 'tooLong'
  | 'url'
  | 'exclamation'
  | 'harmfulAdvice'
  | 'bannedWord'
  | 'medicalClaim'
  | 'tooManyQuestions'
  | 'numbersOff';

export type CoachTextCheck =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly problem: CoachTextProblem };

/** NFKC, no invisible format characters (zero-width, bidi marks): what every check reads. */
function normalise(raw: string): string {
  return raw.normalize('NFKC').replace(/\p{Cf}/gu, '');
}

/** Lower-case, accents removed and curly apostrophes straightened: for accent-free patterns. */
function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[‘’]/g, "'");
}

/**
 * The pressure vocabulary of the No-Dark-Patterns Standard (docs/no-dark-patterns-standard.md),
 * English and French, matched on accent-folded lower-case text: streaks, scores, points, badges,
 * praise-as-reward, "remaining" and "over budget" framing, failure and guilt words.
 */
export const COACH_BANNED_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bstreaks?\b|\bbadges?\b|\bconfetti\b|\bcountdown\b/,
  /\bscores?\b|\bpoints\b|\bgrade[sd]?\b|\blevel(?:s|ed)? up\b/,
  /\bgreat (?:job|work)\b|\bwell done\b|\bgood job\b|\bnailed it\b|\bcrushed it\b|\bperfect\b|\bamazing\b|\bawesome\b|\bcongrat/,
  /\bremaining\b|\bleft today\b|\bcalories? left\b|\bkcal left\b|\bover[- ]?budget\b|\bexceed(?:ed|s)?\b/,
  /\bcheat(?:ing)?\b|\bguilt(?:y)?\b|\bshame\b|\bbad food\b|\bfail(?:ed|ure)?\b|\bnaughty\b/,
  /\bjunk\b|\bclean eating\b|\bdetox\b/,
  /\bseries (?:de jours|continue)|\bserie\b|compte a rebours|\bbravo\b|felicitations|culpabilit|\bscores?\b|\bpoints\b/,
  /\bparfait\b|\bbien joue\b|\bvous reste\b|\brestantes?\b|\brestants?\b|depasse|hors budget|\bsuper\b|\bgenial|\breussi|\bechec\b/,
  /\btricher\b|\btriche\b|\bcoupable\b|\bhonte\b|\bmauvais aliment/,
]);

/** Banned words whose accent matters ("raté", but not "rate"). Matched on lower-case text. */
const COACH_BANNED_ACCENTED = /(?<![\p{L}])(?:raté|manqué)(?![\p{L}])/u;

/** Claims a food coach must never make: it does not diagnose, treat or cure. EN and FR. */
export const COACH_MEDICAL_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bdiagnos(?:e|es|ed|is|ing)\b|\bcures?\b|\bcured\b|\bcuring\b|\btreat(?:s|ed|ing|ment)? (?:your|the|this)\b|\bprescri/,
  /\bdisease\b|\bmedication\b|\bsyndrome\b|\bclinical/,
  /\bdiagnostic\b|\bdiagnostiqu|\bguerir\b|\bguerit\b|\bguerison\b|\btraitement\b|\bprescri|\bmaladie\b|\bmedicament/,
]);

/**
 * Advice a food coach must never give, whatever the data says: skipping meals, fasting, losing
 * weight, calorie deficits, purging, a very low energy figure. Matched on folded text (and, for
 * "jeûne", on the accented text, because "jeune" alone means "young").
 */
export const COACH_HARMFUL_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bskip(?:s|ping|ped)?\b.{0,24}\b(?:meals?|breakfast|lunch|dinner|supper)\b/,
  /\bfast(?:ing|ed)?\b(?! food)/,
  /\blos(?:e|ing) (?:some |more )?weight\b|\bweight loss\b|\bcalorie deficit\b|\bcut(?:ting)? (?:down |back )?(?:on )?(?:your )?calories\b|\bcrash diet\b/,
  /\bsaut(?:er|ez|e|es|ons)\b.{0,24}\b(?:repas|petit[- ]?dejeuner|dejeuner|diner|souper)\b/,
  /\bperdre du poids\b|\bperte de poids\b|\bdeficit calorique\b|\breduire (?:vos|tes|les) calories\b|\bregime drastique\b/,
  /purg|laxati|vomi|vomit/,
]);

const FAST_FR = /jeûn(?:e|er|ez|ons|ant|es)?\b/;

const DAILY_ENERGY =
  /(\d{3,4})\s*(?:kcal|kilocalories?|calories?)\s*(?:a|per|each|every|par|chaque)\s*(?:day|jour)/g;

function hasLowDailyEnergy(folded: string): boolean {
  for (const m of folded.matchAll(DAILY_ENERGY)) {
    if (Number(m[1]) < 1200) return true;
  }
  return false;
}

/** True when the text gives advice a food coach must never give. */
export function containsHarmfulAdvice(text: string): boolean {
  const norm = normalise(text);
  const f = fold(norm);
  return (
    COACH_HARMFUL_PATTERNS.some((p) => p.test(f)) ||
    FAST_FR.test(norm.toLowerCase()) ||
    hasLowDailyEnergy(f)
  );
}

const URL_PATTERN = /:\/\/|\bwww\.|\b[a-z0-9-]+\.[a-z]{2,24}\b/;

/** A figure with a unit: "18 g", "400 kcal", "400 calories", "20 %", "20 percent", "２０ g". */
const NUMBER_WITH_UNIT =
  /\p{Nd}(?:[.,]\p{Nd}+)?\s*(?:%|(?:g|kg|mg|kcal|kilocalories?|calories?|cal|percent|pour ?cent|grammes?|grams?)(?![\p{L}]))/iu;

/** True when the text quotes an amount (digits followed by g, kcal, calories, % ...). */
export function containsNumberWithUnit(text: string): boolean {
  return NUMBER_WITH_UNIT.test(normalise(text));
}

function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

export interface CoachTextRules {
  readonly maxChars: number;
  /** When `false` a text that quotes an amount is refused. */
  readonly numbersOn: boolean;
  /** Question marks allowed (default 1). */
  readonly maxQuestions?: number;
  /** French output gets the narrow no-break space before `? ; :` and inside « ». */
  readonly locale?: 'en' | 'fr';
}

/** French typography: U+202F before `? ; :` (not inside a time or a number) and inside « ». */
function frenchTypography(text: string): string {
  // Built from code points: a literal no-break space in source is easy to lose.
  const nnbsp = String.fromCharCode(0x202f);
  const gap = `[ ${String.fromCharCode(0xa0)}${nnbsp}]*`;
  return text
    .replace(new RegExp(`(?<!\\d)${gap}([?;:])(?!\\d)`, 'g'), `${nnbsp}$1`)
    .replace(new RegExp(`«${gap}`, 'g'), `«${nnbsp}`)
    .replace(new RegExp(`${gap}»`, 'g'), `${nnbsp}»`);
}

/**
 * The one validator. The text is normalised first (NFKC, invisible characters removed, runs of
 * ordinary whitespace collapsed; no-break spaces kept) and the normalised text is what is returned.
 * It is shown only if it is non-empty, within `maxChars`, has no link, no exclamation mark, no
 * harmful advice, no pressure or medical vocabulary, at most `maxQuestions` questions and, while
 * numbers are off, no amount.
 */
export function validateCoachText(raw: unknown, rules: CoachTextRules): CoachTextCheck {
  if (typeof raw !== 'string') return { ok: false, problem: 'empty' };
  let text = normalise(raw)
    .replace(/[ \t\r\n]+/g, ' ')
    .trim();
  if (rules.locale === 'fr') text = frenchTypography(text);
  if (text === '') return { ok: false, problem: 'empty' };
  if (text.length > rules.maxChars) return { ok: false, problem: 'tooLong' };
  const folded = fold(text);
  if (URL_PATTERN.test(folded)) return { ok: false, problem: 'url' };
  if (/[!！‼❗¡]/u.test(text)) return { ok: false, problem: 'exclamation' };
  if (containsHarmfulAdvice(text)) return { ok: false, problem: 'harmfulAdvice' };
  if (
    COACH_BANNED_PATTERNS.some((p) => p.test(folded)) ||
    COACH_BANNED_ACCENTED.test(text.toLowerCase())
  ) {
    return { ok: false, problem: 'bannedWord' };
  }
  if (COACH_MEDICAL_PATTERNS.some((p) => p.test(folded))) {
    return { ok: false, problem: 'medicalClaim' };
  }
  if (countQuestions(text) > (rules.maxQuestions ?? 1)) {
    return { ok: false, problem: 'tooManyQuestions' };
  }
  if (!rules.numbersOn && containsNumberWithUnit(text)) {
    return { ok: false, problem: 'numbersOff' };
  }
  return { ok: true, text };
}

/** What a coach note asks the model to answer with: `{ "note": string, "followUp": string }`. */
export interface AiCoachNote {
  readonly note: string;
  /** Empty when the model gave none (or a bad one): the card then has no follow-up. */
  readonly followUp: string;
}

/** The JSON object a model reply is: bare, or alone inside a code fence. Anything else is `null`. */
function jsonObjectOf(raw: string): unknown {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Reads and validates a model reply against the note contract. `null` when it is not the
 * contract, or the note fails the validator; a bad `followUp` alone is dropped (empty) rather
 * than costing the note.
 */
export function parseAiCoachNote(
  raw: string,
  numbersOn: boolean,
  locale?: 'en' | 'fr',
): AiCoachNote | null {
  const json = jsonObjectOf(raw);
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const { note, followUp } = json as Record<string, unknown>;
  const checked = validateCoachText(note, {
    maxChars: COACH_LIMITS.noteChars,
    numbersOn,
    ...(locale ? { locale } : {}),
  });
  if (!checked.ok) return null;
  const follow = validateCoachText(followUp, {
    maxChars: COACH_LIMITS.followUpChars,
    numbersOn,
    ...(locale ? { locale } : {}),
  });
  return { note: checked.text, followUp: follow.ok ? follow.text : '' };
}

/**
 * What a worry routes to, decided on the device before any AI call:
 *  - `selfHarm`: thoughts of suicide or self-harm, answered with crisis lines;
 *  - `urgent`: a possibly urgent symptom (chest pain, breathing, a swelling throat, an allergic
 *    reaction, fainting), answered with "call the emergency number now";
 *  - `eatingWorry`: an eating-disorder signal, answered with the calm support line;
 *  - `medicalSymptom`: any other symptom, answered with "check with a doctor or a pharmacist".
 */
export type SupportSignal = 'selfHarm' | 'urgent' | 'eatingWorry' | 'medicalSymptom';

const SELF_HARM_PATTERNS: readonly RegExp[] = [
  /\bkill(?:ing)? myself\b|\bsuicid|\bwant(?:ed)? to die\b|\bwanna die\b|\bend(?:ing)? my (?:own )?life\b|\bself[- ]?harm|\bhurt(?:ing)? myself\b|\bbetter off dead\b/,
  /\bje veux mourir\b|\benvie de mourir\b|\bmourir\b|\bme suicid|\bme tuer\b|\bme faire du mal\b|\ben finir\b|\bidees? noires?\b|\bautomutil/,
];

const URGENT_PATTERNS: readonly RegExp[] = [
  /\bchest pain\b|\bpass(?:ed|ing) out\b|\bfaint(?:ed|ing)?\b|\b(?:can'?t|cannot|unable to|trouble|difficulty) breath|\bthroat\b.{0,24}\bswell|\bswell\w*\b.{0,16}\bthroat\b|\banaphyla|\ballergic reaction\b|\bblack(?:ed|ing) out\b/,
  /douleurs? (?:a la |dans la |au niveau de la )?poitrine|\bevanou|\bperte de connaissance\b|\bperdu connaissance\b|reaction allergique|choc anaphyla|\brespirer\b.{0,20}\b(?:pas|difficile)|\barrive pas a respirer|\bdifficultes? a respirer|\bgorge\b.{0,24}\b(?:gonfl|enfl)/,
];

const EATING_WORRY_PATTERNS: readonly RegExp[] = [
  /\bbing(?:e|ed|eing|es|ing)\b|\bpurg(?:e|ed|es|ing)\b|\bstarv(?:e|ed|es|ing|ation)\b/,
  /\bvomit|\bthr(?:ew|ow|own|owing) up\b|\bmak(?:e|ing) myself (?:sick|throw)/,
  /\beating disorder|\banorexi|\bbulimi|\blaxativ|\bhyperphagi/,
  /\bhate (?:my body|myself|eating)\b|\bafraid of eating\b/,
  /\bnot eat(?:ing)? (?:for|at all)\b|\bstop(?:ped)? eating\b|\b(?:haven'?t|have not|hasn'?t) eaten\b.{0,16}\b(?:in|for|since)\b/,
  /\bfasting\b|\bi(?:'ve| have)? (?:been )?fast(?:ing|ed)?\b|\bfast(?:ing|ed)? for \d/,
  /\bi (?:often |always |keep |regularly |usually )?skip(?:ped)? (?:my )?(?:meals?|breakfast|lunch|dinner)\b|\bskip(?:ping)? meals? to\b/,
  /vomi|me fais vomir|me faire vomir|crises? de boulimie|boulimi|anorexi|hyperphagi|\btroubles? (?:du |des )?(?:comportements?|conduites?) alimentaires?\b|\btca\b/,
  /\bcrises? (?:alimentaires?|de compulsion)\b|\bcompulsions? alimentaires?\b|\blaxatifs?\b/,
  /\bje (?:me )?(?:prive|affame)\b|\bme priver de manger\b|\bje (?:ne )?mange (?:plus|rien)\b|\barreter de manger\b|\bje saute (?:des |mes |le |un |les )?(?:repas|petit|dejeuner|diner)\b|\bsauter des repas\b/,
  /\bje jeune\b|\bjeune (?:depuis|pendant)\b|\bje me deteste\b|\bhonte de manger\b|\bpeur de manger\b/,
];

const EATING_ACCENTED: readonly RegExp[] = [
  /\bje je[uû]ne\b|\bje[uû]n(?:e|er|ons) (?:depuis|pendant)\b/i,
];

const MEDICAL_SYMPTOM_PATTERNS: readonly RegExp[] = [
  /\bdizz(?:y|iness)\b|\bblood in\b|\bsevere pain\b|\bnausea\b|\bheart racing\b/,
  /\bmalaise\b|vertiges?|\bsang dans\b|\bdouleurs? (?:intense|forte)|\bnausees?\b/,
];

/** "how can I eat 600 calories a day": a daily energy figure under 1200. */
function eatsVeryLittle(folded: string): boolean {
  for (const m of folded.matchAll(
    /(\d{3,4})\s*(?:kcal|kilocalories?|calories?)\s*(?:a|per|each|every|par|chaque|\/)?\s*(?:day|daily|jour)/g,
  )) {
    if (Number(m[1]) < 1200) return true;
  }
  return false;
}

/**
 * Whether a typed question is about a worry, a symptom or an emergency. Checked locally, before
 * anything is sent: such a question is answered with support, never with advice, and never leaves
 * the device. Order: selfHarm, urgent, eatingWorry, medicalSymptom.
 */
export function detectSupportSignal(text: string): SupportSignal | null {
  const norm = normalise(text);
  const f = fold(norm);
  if (SELF_HARM_PATTERNS.some((p) => p.test(f))) return 'selfHarm';
  if (URGENT_PATTERNS.some((p) => p.test(f))) return 'urgent';
  if (
    EATING_WORRY_PATTERNS.some((p) => p.test(f)) ||
    EATING_ACCENTED.some((p) => p.test(norm)) ||
    eatsVeryLittle(f)
  ) {
    return 'eatingWorry';
  }
  if (MEDICAL_SYMPTOM_PATTERNS.some((p) => p.test(f))) return 'medicalSymptom';
  return null;
}
