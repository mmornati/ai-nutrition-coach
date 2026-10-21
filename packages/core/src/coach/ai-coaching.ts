/**
 * The pure rules around an AI-written coach text (docs/ai-tiers.md, "Coaching"): the output
 * contract, the validator every AI text passes before it is shown, and the local check that routes
 * a worry about food or health to a calm support line BEFORE anything is sent to an AI.
 *
 * Nothing here knows about a network, a model or a screen. An AI text is untrusted input: it is
 * shown only if it passes `validateCoachText`, otherwise the caller falls back to the template
 * coach (a note) or says so calmly (a chat).
 */

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
 * `questionKey` is one of these (there is no copy under them, so the stored `text` is what is
 * shown) and whose `text` is the validated AI text. The follow-up is a second row.
 */
export const AI_NOTE_QUESTION_KEY = 'post.resolve.ai';
export const AI_FOLLOW_UP_QUESTION_KEY = 'depth.followUp.ai';

/** True for a note row written by the AI coach (see `AI_NOTE_QUESTION_KEY`). */
export const isAiCoachNote = (note: { readonly questionKey: string }): boolean =>
  note.questionKey === AI_NOTE_QUESTION_KEY || note.questionKey === AI_FOLLOW_UP_QUESTION_KEY;

export type CoachTextProblem =
  | 'empty'
  | 'tooLong'
  | 'url'
  | 'exclamation'
  | 'bannedWord'
  | 'medicalClaim'
  | 'tooManyQuestions'
  | 'numbersOff';

export type CoachTextCheck =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly problem: CoachTextProblem };

/**
 * The pressure vocabulary of the No-Dark-Patterns Standard (docs/no-dark-patterns-standard.md),
 * English and French: streaks, scores, points, badges, praise-as-reward, "remaining" and
 * "over budget" framing, failure and guilt words. Mirrors the catalogue tests
 * (`apps/web/src/i18n/fr.test.ts`, `no-dark-patterns.test.ts`).
 */
export const COACH_BANNED_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bstreaks?\b|\bbadges?\b|\bconfetti\b|\bcountdown\b/i,
  /\bscores?\b|\bpoints\b|\bgrade[sd]?\b|\blevel(?:s|ed)? up\b/i,
  /\bgreat job\b|\bwell done\b|\bgood job\b|\bamazing\b|\bawesome\b|\bcongrat/i,
  /\bremaining\b|\bleft today\b|\bcalories? left\b|\bover[- ]?budget\b|\bexceed(?:ed|s)?\b/i,
  /\bcheat(?:ing)?\b|\bguilt(?:y)?\b|\bshame\b|\bbad food\b|\bfail(?:ed|ure)?\b|\bnaughty\b/i,
  /\bjunk\b|\bclean eating\b|\bdetox\b/i,
  /séries?\b|compte à rebours|\bbravo\b|félicitations|culpabilit|\bscores?\b|\bpoints\b/i,
  /\brestantes?\b|\brestants?\b|dépassé|hors budget|\bsuper\b|\bgénial|\bréussi|\béchec\b|\braté|\bmanqué/i,
  /\btricher\b|\btriche\b|\bcoupable\b|\bhonte\b|\bmauvais aliment/i,
]);

/** Claims a food coach must never make: it does not diagnose, treat or cure. EN and FR. */
export const COACH_MEDICAL_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bdiagnos(?:e|es|ed|is|ing)\b|\bcures?\b|\bcured\b|\bcuring\b|\btreat(?:s|ed|ing|ment)? (?:your|the|this)\b|\bprescri/i,
  /\bdisease\b|\bmedication\b|\bsyndrome\b|\bclinical/i,
  /\bdiagnostic\b|\bdiagnostiqu|\bguérir\b|\bguérit\b|\bguérison\b|\btraitement\b|\bprescri|\bmaladie\b|\bmédicament/i,
]);

const URL_PATTERN =
  /https?:\/\/|\bwww\.|\bftp:\/\/|\b[a-z0-9-]+\.(?:com|org|net|io|fr|co|uk|app|dev|info|ai|me|ly|xyz)\b/i;

/** A figure with a unit: "18 g", "18g", "400 kcal", "20 %", "20%", "1,5 g". */
const NUMBER_WITH_UNIT = /\d(?:[.,]\d+)?\s*(?:g|kg|mg|kcal|cal|%|grammes?|grams?)(?![\p{L}])/iu;

/** True when the text quotes an amount (digits followed by g, kcal or %). */
export function containsNumberWithUnit(text: string): boolean {
  return NUMBER_WITH_UNIT.test(text);
}

function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

export interface CoachTextRules {
  readonly maxChars: number;
  /** When `false` a text that quotes an amount (digits followed by g, kcal, %) is refused. */
  readonly numbersOn: boolean;
  /** Question marks allowed (default 1). */
  readonly maxQuestions?: number;
}

/**
 * The one validator. A text is shown only if it is non-empty, within `maxChars`, has no link, no
 * exclamation mark, no pressure or medical vocabulary, at most `maxQuestions` questions and, while
 * numbers are off, no amount. The text is returned trimmed with its whitespace collapsed.
 */
export function validateCoachText(raw: unknown, rules: CoachTextRules): CoachTextCheck {
  if (typeof raw !== 'string') return { ok: false, problem: 'empty' };
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text === '') return { ok: false, problem: 'empty' };
  if (text.length > rules.maxChars) return { ok: false, problem: 'tooLong' };
  if (URL_PATTERN.test(text)) return { ok: false, problem: 'url' };
  if (text.includes('!')) return { ok: false, problem: 'exclamation' };
  if (COACH_BANNED_PATTERNS.some((p) => p.test(text))) return { ok: false, problem: 'bannedWord' };
  if (COACH_MEDICAL_PATTERNS.some((p) => p.test(text))) {
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
export function parseAiCoachNote(raw: string, numbersOn: boolean): AiCoachNote | null {
  const json = jsonObjectOf(raw);
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const { note, followUp } = json as Record<string, unknown>;
  const checked = validateCoachText(note, { maxChars: COACH_LIMITS.noteChars, numbersOn });
  if (!checked.ok) return null;
  const follow = validateCoachText(followUp, {
    maxChars: COACH_LIMITS.followUpChars,
    numbersOn,
  });
  return { note: checked.text, followUp: follow.ok ? follow.text : '' };
}

/** What a worry routes to, decided on the device before any AI call. */
export type SupportSignal = 'eatingWorry' | 'medicalSymptom';

const EATING_WORRY_PATTERNS: readonly RegExp[] = [
  /\bbing(?:e|ed|eing|es)\b|\bpurg(?:e|ed|es|ing)\b|\bstarv(?:e|ed|es|ing|ation)\b/i,
  /\bvomit|\bthrow(?:ing)? up\b|\bmake myself (?:sick|throw)|\bmaking myself (?:sick|throw)/i,
  /\beating disorder|\banorexi|\bbulimi|\blaxatives?\b/i,
  /\bhate (?:my body|myself|eating)\b|\bafraid of eating\b/i,
  /\bnot eat(?:ing)? (?:for|at all)\b|\bstop(?:ped)? eating\b/i,
  /vomi|me fais vomir|me faire vomir|crises? de boulimie|boulimi|anorexi|\btroubles? (?:du |des )?(?:comportements?|conduites?) alimentaires?\b|\btca\b/i,
  /\bcrises? (?:alimentaires?|de compulsion)\b|\bcompulsions? alimentaires?\b|\blaxatifs?\b/i,
  /\bje (?:me )?(?:prive|affame)\b|\bme priver de manger\b|\bje ne mange (?:plus|rien) (?:du tout|depuis)|\bje ne mange plus\b|\barrêter de manger\b/i,
  /\bje me d[ée]teste\b|\bhonte de manger\b|\bpeur de manger\b/i,
];

const MEDICAL_SYMPTOM_PATTERNS: readonly RegExp[] = [
  /\bchest pain\b|\bpassed out\b|\bfaint(?:ed|ing)?\b|\bdizz(?:y|iness)\b|\bblood in\b|\bsevere pain\b|\bcan'?t breathe\b|\ballergic reaction\b|\banaphyla/i,
  /douleurs? (?:à la |dans la )?poitrine|\bévanou|\bmalaise\b|vertiges?|\bsang dans\b|\bdouleurs? (?:intense|forte)|\bréaction allergique\b|\bchoc anaphyla/i,
];

/**
 * Whether a typed question is about an eating worry or a health symptom. Checked locally, before
 * anything is sent: such a question is answered with the calm support line, never with advice.
 * The eating worry wins when both appear.
 */
export function detectSupportSignal(text: string): SupportSignal | null {
  const flat = text.normalize('NFC').replace(/’/g, "'");
  if (EATING_WORRY_PATTERNS.some((p) => p.test(flat))) return 'eatingWorry';
  if (MEDICAL_SYMPTOM_PATTERNS.some((p) => p.test(flat))) return 'medicalSymptom';
  return null;
}
