import {
  decodeOptions,
  FOOD_SLOTS,
  isFoodSlot,
  isTextParam,
  splitQuestionKey,
  type CoachParams,
  type FoodSlot,
} from '@anc/core';
import { formatAmount, formatWhole } from '../components/nutrition/format';
import { currentLocale, fill, plural, type PluralForms, type Strings } from '../i18n';
import { intlTag, type Locale } from '../i18n/locale';

/**
 * The template of a line that may have singular and plural forms (a count of days or meals in it:
 * "1 logged day", "6 logged days"), chosen by `count` with the catalogue's plural rule of the
 * language. A plain string is returned as it is.
 */
export function copyTemplate(
  copy: string | PluralForms,
  count: number,
  locale: Locale = currentLocale(),
): string {
  return typeof copy === 'string' ? copy : plural(copy, count, locale);
}

/** A food name read mid-sentence: lower-case first letter, unless the name is a brand or acronym. */
export function lowerFirst(name: string): string {
  const capitals = (name.match(/\p{Lu}/gu) ?? []).length;
  return capitals >= 2 || name === '' ? name : name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * "eggs, beans or fish" in the language: the foods a slot names, or its neutral phrase. A note
 * written before foods became slots carries none, and its stored foods were never filtered for the
 * person: it is shown with the neutral, food-free phrase rather than a generic pool that could
 * name a food the current diet or allergies rule out.
 */
export function slotText(
  all: Strings,
  slot: FoodSlot,
  stored: string | undefined,
  locale: Locale = currentLocale(),
): string {
  const ids = stored === undefined ? [] : decodeOptions(stored);
  if (ids.length === 0) return all.coachSlotFallback[slot];
  const names = ids.map((id) => all.coachFoods[id]);
  return new Intl.ListFormat(intlTag(locale), { type: 'disjunction' }).format(names);
}

/**
 * The raw values of a coach note ({food}, {g}, {pct}, {kcal}, {days}, {of}, {est}) turned into
 * the words the copy interpolates, in the given language: numbers are formatted here, at display
 * time, and a `~` (`{approx}`) stands before an estimated figure. `{foodLc}` and `{food2Lc}` are
 * the food names read mid-sentence.
 */
export function coachCopyVars(
  params: CoachParams,
  locale: Locale = currentLocale(),
): Readonly<Record<string, string>> {
  const out: Record<string, string> = { approx: params['est'] === 1 ? '~' : '' };
  for (const [key, value] of Object.entries(params)) {
    if (key === 'est') continue;
    out[key] =
      typeof value !== 'number'
        ? value
        : key === 'g'
          ? formatAmount(value, locale)
          : formatWhole(value, locale);
    if (typeof value === 'string' && (key === 'food' || key === 'food2')) {
      out[`${key}Lc`] = lowerFirst(value);
    }
  }
  return out;
}

/**
 * Fills a template's food slots (`{protein}`, `{dairy}` ...) from the options stored with the note
 * (`stored[slot]`, `eggs.beans` or `none`) and then the other variables. A slot with no option left
 * (every one blocked by the diet or an allergy, or an older note that stored none) is filled with
 * its neutral, food-free phrase, which carries its own article: "Some {protein} at lunch" reads "A
 * protein you enjoy at lunch" (capitalised at the start of a sentence), never "Some a protein".
 */
export function fillFoodSlots(
  all: Strings,
  template: string,
  vars: Readonly<Record<string, string>>,
  stored: CoachParams | Readonly<Record<string, string | undefined>>,
  locale: Locale = currentLocale(),
): string {
  const out: Record<string, string> = { ...vars };
  let text = template;
  for (const slot of FOOD_SLOTS) {
    if (!text.includes(`{${slot}}`)) continue;
    const value = stored[slot];
    const named = typeof value === 'string' ? decodeOptions(value) : [];
    out[slot] = slotText(all, slot, typeof value === 'string' ? value : undefined, locale);
    if (named.length === 0) {
      out[`${slot}Cap`] = out[slot].charAt(0).toUpperCase() + out[slot].slice(1);
      text = text
        .replace(new RegExp(`(^|[.?!]\\s+)Some \\{${slot}\\}`, 'g'), `$1{${slot}Cap}`)
        .replace(new RegExp(`\\b[Ss]ome \\{${slot}\\}`, 'g'), `{${slot}}`);
    }
  }
  return fill(text, out);
}

/**
 * The copy of a (possibly parameterised) coach question key in the given catalogue, or
 * `undefined` when the catalogue has none. Own keys only: a key like `toString` is not copy.
 *
 * Variants of one key, tried in this order: `.twoNonum` and `.nonum` (the same line without a
 * figure, for numbers turned off), `.two` (two foods named), `.none` (a nutrient with nothing
 * logged). The food slots (`{protein}`, `{dairy}` ...) are filled from the options the note
 * stored, or from the plain pool for an older note.
 */
export function coachCopy(
  all: Strings,
  questionKey: string,
  extra: CoachParams = {},
  locale: Locale = currentLocale(),
): string | undefined {
  const { base, params } = splitQuestionKey(questionKey);
  const questions = all.coachQuestions as Readonly<Record<string, string>>;
  const merged = { ...params, ...extra };
  const two = merged['food2'] !== undefined;
  const nonum = merged['nonum'] === 1;
  const candidates = [
    ...(nonum && two ? [`${base}.twoNonum`] : []),
    ...(nonum ? [`${base}.nonum`] : []),
    ...(two ? [`${base}.two`] : []),
    ...(merged['zero'] === 1 ? [`${base}.none`] : []),
    base,
  ];
  const key = candidates.find((candidate) => Object.hasOwn(questions, candidate));
  if (key === undefined) return undefined;
  const vars: Record<string, string> = { ...coachCopyVars(merged, locale) };
  const pct = merged['pct'];
  if (typeof pct === 'number') {
    vars['share'] =
      pct < 1 ? all.coachShare.underOne : fill(all.coachShare.around, { pct: vars['pct'] ?? '' });
  }
  const template = questions[key]!;
  return fillFoodSlots(all, template, vars, merged, locale);
}

/** The `{slot}` names a template uses. */
export const slotsOfTemplate = (template: string): FoodSlot[] =>
  [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').filter(isFoodSlot);

/**
 * True when the key carries nutrient numbers (so it is hidden while numbers are off, unless the
 * catalogue has a figure-free variant of it, see `coachCopyForDisplay`). Words (a food, the food
 * slots, the language) and the `nonum` marker are not numbers.
 */
export const coachKeyHasNumbers = (questionKey: string): boolean =>
  Object.keys(splitQuestionKey(questionKey).params).some(
    (key) => !isTextParam(key) && key !== 'nonum',
  );

/**
 * The line to show for a stored key right now: its copy while numbers are on; while they are off,
 * the copy of a key without figures, the figure-free variant of one with figures, or `undefined`
 * (nothing is shown) when there is none.
 */
export function coachCopyForDisplay(
  all: Strings,
  questionKey: string,
  showNumbers: boolean,
  locale: Locale = currentLocale(),
): string | undefined {
  if (showNumbers || !coachKeyHasNumbers(questionKey))
    return coachCopy(all, questionKey, {}, locale);
  const { base } = splitQuestionKey(questionKey);
  const questions = all.coachQuestions as Readonly<Record<string, string>>;
  return Object.hasOwn(questions, `${base}.nonum`)
    ? coachCopy(all, questionKey, { nonum: 1 }, locale)
    : undefined;
}
