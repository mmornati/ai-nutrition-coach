/**
 * The pure rules around an AI-written coach text (docs/ai-tiers.md, "Coaching"): the output
 * contract, the validator every AI text passes before it is shown, and the local check that routes
 * a worry about food or health to a calm support line BEFORE anything is sent to an AI.
 *
 * Nothing here knows about a network, a model or a screen. An AI text is untrusted input: it is
 * shown only if it passes `validateCoachText`, otherwise the caller falls back to the template
 * coach (a note) or says so calmly (a chat).
 *
 * WHAT THE VALIDATOR IS, PLAINLY. It is a BACKSTOP of pattern and number checks (normalisation,
 * look-alike refusal, a harmful-phrase list with clause-level negation, a structural energy-figure
 * guard, a loss-pace guard). It cannot catch every wording a model might produce. The system prompt
 * (`ai-prompts.ts`) is the first layer; the built-in rules-based coach never depends on this
 * validator at all, and is what a person sees when the AI is off or its text is refused.
 */
import { splitQuestionKey, withQuestionParams } from '../value-types/composition-pattern';
import { askEatsVeryLittle, exceedsSafePaceIn, unsafeEnergyIn } from './energy-guard';
import { askMentionsHarmfulPlan, hasBodyComment, hasHarmfulPattern } from './harm-rules';
import { foldText, hasMixedScriptWord, normaliseText, prepareText, scanNumbers } from './text-prep';

export {
  exceedsSafePace,
  hasUnsafeEnergyFigure,
  MAX_SAFE_LOSS_KG_PER_WEEK,
  statedLossPerWeek,
} from './energy-guard';

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
  | 'bodyComment'
  /** Talk about losing weight, for a person who has not chosen that goal (the restrained mode). */
  | 'weightTalk'
  | 'bannedWord'
  | 'medicalClaim'
  | 'tooManyQuestions'
  | 'numbersOff';

export type CoachTextCheck =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly problem: CoachTextProblem };

/** NFKC, no invisible format characters (zero-width, bidi marks): what every check reads. */
function normalise(raw: string): string {
  return normaliseText(raw);
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
  /\bjunk\b|\bclean eating\b/,
  /\bseries (?:de jours|continue)|\bserie\b|compte a rebours|\bbravo\b|felicitations|culpabilit|\bscores?\b|\bpoints\b/,
  /\bparfait\b|\bbien joue\b|\bvous reste\b|\brestantes?\b|\brestants?\b|depasse|hors budget|\bsuper\b|\bgenial|\breussi|\bechec\b/,
  /\btricher\b|\btriche\b|\bcoupable\b|\bhonte\b|\bmauvais aliment/,
]);

/** Banned words whose accent matters ("raté", but not "rate"). Matched on lower-case text. */
const COACH_BANNED_ACCENTED = /(?<![\p{L}])(?:raté|manqué)(?![\p{L}])/u;

/**
 * Claims a food coach must never make: it does not diagnose, treat or cure. EN and FR. The words
 * about medication, disease and clinical care are only a problem when the text does NOT also send
 * the person to a doctor, a dietitian or a pharmacist (see `REFERRAL`): "if you take medication,
 * talk to your doctor first" is exactly what the coach should say.
 */
export const COACH_MEDICAL_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bdiagnos(?:e|es|ed|is|ing)\b|\bcures\b|\bcure (?:for|your|this|it|the|that|diabetes|cancer)\b|\b(?:will|can|could|may|to|that|which|and) cure\b|\bcured(?! (?:meats?|ham|hams|sausages?|bacon|fish|salmon|cheese|products?)\b)|\bcuring\b|\btreat(?:s|ed|ing|ment)? (?:your|the|this)\b|\bprescri/,
  /\bdiagnostic\b|\bdiagnostiqu|\bguerir\b|\bguerit\b|\bguerison\b|\bprescri/,
]);

/** Medical words that are acceptable next to a pointer to a professional. */
const COACH_MEDICAL_REFERRAL_ONLY: readonly RegExp[] = Object.freeze([
  /\bdisease\b|\bmedication\b|\bmedicine\b|\bsyndrome\b|\bclinical/,
  /\bmaladie\b|\bmedicament|\btraitement\b/,
]);

/** A pointer to a professional, EN and FR (folded). */
const REFERRAL =
  /\b(?:doctor|physician|gp|dietitian|dietician|pharmacist|health(?:care)? (?:professional|provider)|medical professional|midwife)\b|\bmedecin\b|\bdieteticien|\bnutritionniste\b|\bpharmacien|\bprofessionnel de sante\b|\bsage[- ]femme\b|\bmedecin traitant\b/;

/** The blanket phrases of the restrained mode: a person who has not chosen a weight goal. */
export const COACH_WEIGHT_TALK_PATTERNS: readonly RegExp[] = Object.freeze([
  /\blos(?:e|ing) (?:some |more )?weight\b|\bweight loss\b|\bcalorie deficit\b|\bcut(?:ting)? (?:down |back )?(?:on )?(?:your )?calories\b/,
  /\bperdre du poids\b|\bperte de poids\b|\bdeficit calorique\b|\breduire (?:vos|tes|les) calories\b/,
]);

export interface HarmfulAdviceOptions {
  readonly floorKcal?: number;
  readonly guideKcal?: number;
}

/**
 * True when the text gives advice a food coach must never give: fasting, skipping or replacing a
 * meal, detox, drugs and supplements, fad diets, compensation, moral words (`harm-rules.ts`), a
 * daily energy figure under the person's guide (`energy-guard.ts`), a loss faster than a kilo a
 * week, or a word that mixes Latin letters with Cyrillic or Greek look-alikes. A mention that
 * advises AGAINST the thing ("do not skip meals") is not advice to do it.
 *
 * HONESTY: this is a backstop of pattern and number checks. It cannot catch every wording. The
 * system prompt is the first layer; the built-in rules-based coach never depends on this check.
 */
export function containsHarmfulAdvice(text: string, options: HarmfulAdviceOptions = {}): boolean {
  const { norm, f } = prepareText(text);
  if (hasMixedScriptWord(norm)) return true;
  return hasHarmfulPattern(f) || unsafeEnergyIn(f, options) || exceedsSafePaceIn(f);
}

/** True when the text comments on the person's body or labels it. */
export function containsBodyComment(text: string): boolean {
  return hasBodyComment(prepareText(text).f);
}

const URL_PATTERN = /:\/\/|\bwww\.|\b[a-z0-9-]+\.[a-z]{2,24}\b/;

/** A figure with a unit: "18 g", "400 kcal", "400 calories", "20 %", "20 percent", "２０ g". */
const NUMBER_WITH_UNIT =
  /\p{Nd}(?:[.,]\p{Nd}+)?\s*(?:%|(?:g|kg|mg|kcal|kilocalories?|calories?|cal|percent|pour ?cent|grammes?|grams?)(?![\p{L}]))/iu;

/** True when the text quotes an amount (digits followed by g, kcal, calories, % ...). */
export function containsNumberWithUnit(text: string): boolean {
  const norm = normalise(text);
  if (NUMBER_WITH_UNIT.test(norm)) return true;
  // Spelled-out amounts count too: "four hundred calories", "quatre cents kcal", "a thousand kcal".
  const f = foldText(norm);
  return scanNumbers(f).some((n) => SPELLED_UNIT_AFTER.test(f.slice(n.end, n.end + 16)));
}

const SPELLED_UNIT_AFTER =
  /^\s{0,2}(?:%|percent|pour ?cent|pourcent|kcals?|kilocalor\w*|calor\w*|cals?|kj|kilojoules?|kgs?|kilos?|kilograms?|kilogrammes?|mg|g|grams?|grammes?)(?![a-z])/;

function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

export interface CoachTextRules {
  readonly maxChars: number;
  /**
   * `allowed`: the person chose to lose or gain weight, so a helpful answer about it passes (the
   * harmful-advice checks still apply). `restrained` (the default): the person chose no weight
   * goal, so any talk of losing weight, a calorie deficit or cutting calories is refused.
   */
  readonly weightTalk?: 'allowed' | 'restrained';
  /** The lowest daily figure that may appear (the person's floor, kcal). Default 1200. */
  readonly floorKcal?: number;
  /** The person's daily guide, kcal: a daily figure below it is refused when it is a target. */
  readonly guideKcal?: number;
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
  if (URL_PATTERN.test(fold(text))) return { ok: false, problem: 'url' };
  if (/[!！‼❗¡]/u.test(text)) return { ok: false, problem: 'exclamation' };
  const folded = prepareText(text).f;
  if (!rules.numbersOn && containsNumberWithUnit(text)) {
    return { ok: false, problem: 'numbersOff' };
  }
  if (
    COACH_BANNED_PATTERNS.some((p) => p.test(folded)) ||
    COACH_BANNED_ACCENTED.test(text.toLowerCase())
  ) {
    return { ok: false, problem: 'bannedWord' };
  }
  if (COACH_MEDICAL_PATTERNS.some((p) => p.test(folded))) {
    return { ok: false, problem: 'medicalClaim' };
  }
  if (COACH_MEDICAL_REFERRAL_ONLY.some((p) => p.test(folded)) && !REFERRAL.test(folded)) {
    return { ok: false, problem: 'medicalClaim' };
  }
  if (
    containsHarmfulAdvice(text, {
      ...(rules.floorKcal !== undefined ? { floorKcal: rules.floorKcal } : {}),
      ...(rules.guideKcal !== undefined ? { guideKcal: rules.guideKcal } : {}),
    })
  ) {
    return { ok: false, problem: 'harmfulAdvice' };
  }
  if (containsBodyComment(text)) return { ok: false, problem: 'bodyComment' };
  if (
    (rules.weightTalk ?? 'restrained') === 'restrained' &&
    COACH_WEIGHT_TALK_PATTERNS.some((p) => p.test(folded))
  ) {
    return { ok: false, problem: 'weightTalk' };
  }
  if (countQuestions(text) > (rules.maxQuestions ?? 1)) {
    return { ok: false, problem: 'tooManyQuestions' };
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
  limits: Pick<CoachTextRules, 'weightTalk' | 'floorKcal' | 'guideKcal'> = {},
): AiCoachNote | null {
  const json = jsonObjectOf(raw);
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const { note, followUp } = json as Record<string, unknown>;
  const checked = validateCoachText(note, {
    maxChars: COACH_LIMITS.noteChars,
    numbersOn,
    ...limits,
    ...(locale ? { locale } : {}),
  });
  if (!checked.ok) return null;
  const follow = validateCoachText(followUp, {
    maxChars: COACH_LIMITS.followUpChars,
    numbersOn,
    ...limits,
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
 *  - `medicalSymptom`: any other symptom, answered with "check with a doctor or a pharmacist";
 *  - `extremeDiet`: a request for a very low daily intake ("800 kcal") or a very fast loss
 *    ("lose 5 kg in a week"), answered with the fixed calm line about a gentler pace.
 */
export type SupportSignal =
  | 'selfHarm'
  | 'urgent'
  | 'eatingWorry'
  | 'medicalSymptom'
  /** A request for a very low daily intake or for a very fast loss: answered with the fixed calm line. */
  | 'extremeDiet';

const SELF_HARM_PATTERNS: readonly RegExp[] = [
  /\bkill(?:ing)? myself\b|\bsuicid|\bwant(?:ed)? to die\b|\bwanna die\b|\bend(?:ing)? my (?:own )?life\b|\bself[- ]?harm|\bhurt(?:ing)? myself\b|\bbetter off dead\b/,
  /\bje veux mourir\b(?! de (?:faim|rire|soif|froid|chaud|ennui|envie|honte))|\benvie de mourir\b(?! de (?:faim|rire|soif|froid|chaud|ennui|envie|honte))|\bmourir\b(?! de (?:faim|rire|soif|froid|chaud|ennui|envie|honte))|\bme suicid|\bme tuer\b|\bme faire du mal\b|\ben finir\b|\bidees? noires?\b|\bautomutil/,
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

/** "lose 5 kg in a week", "perdre 10 kilos en un mois": a fast loss, over a kilo a week. */
function wantsFastLoss(folded: string): boolean {
  return (
    exceedsSafePaceIn(folded) ||
    /\b(?:lose|loss|perdre|maigrir)\b.{0,30}\b(?:fast|quickly|asap|overnight|vite|rapidement|en urgence|en quelques jours|in a few days|in days)\b/.test(
      folded,
    ) ||
    /\b(?:rapid|fast|quick) (?:weight )?loss\b|\bperte de poids rapide\b|\bminceur express\b|\bcrash diet\b|\bregime express\b/.test(
      folded,
    )
  );
}

/**
 * Whether a typed question is about a worry, a symptom or an emergency. Checked locally, before
 * anything is sent: such a question is answered with support, never with advice, and never leaves
 * the device. Order: selfHarm, urgent, eatingWorry, extremeDiet, medicalSymptom.
 */
export function detectSupportSignal(text: string): SupportSignal | null {
  const { norm, f } = prepareText(text);
  if (SELF_HARM_PATTERNS.some((p) => p.test(f))) return 'selfHarm';
  if (URGENT_PATTERNS.some((p) => p.test(f))) return 'urgent';
  if (EATING_WORRY_PATTERNS.some((p) => p.test(f)) || EATING_ACCENTED.some((p) => p.test(norm))) {
    return 'eatingWorry';
  }
  if (askEatsVeryLittle(f) || wantsFastLoss(f) || askMentionsHarmfulPlan(f)) return 'extremeDiet';
  if (MEDICAL_SYMPTOM_PATTERNS.some((p) => p.test(f))) return 'medicalSymptom';
  return null;
}
