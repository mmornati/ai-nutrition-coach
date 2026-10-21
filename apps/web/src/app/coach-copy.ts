import { splitQuestionKey, type CoachParams } from '@anc/core';
import { formatAmount, formatWhole } from '../components/nutrition/format';
import { currentLocale, fill, type Strings } from '../i18n';
import type { Locale } from '../i18n/locale';

/**
 * The raw values of a coach note ({food}, {g}, {pct}, {kcal}, {days}, {of}, {est}) turned into
 * the words the copy interpolates, in the given language: numbers are formatted here, at display
 * time, and a `~` (`{approx}`) stands before an estimated figure.
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
  }
  return out;
}

/**
 * The copy of a (possibly parameterised) coach question key in the given catalogue, or
 * `undefined` when the catalogue has none. Own keys only: a key like `toString` is not copy.
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
  // A day with none of the nutrient says so plainly instead of quoting "0 g".
  const key =
    merged['zero'] === 1 && Object.hasOwn(questions, `${base}.none`) ? `${base}.none` : base;
  if (!Object.hasOwn(questions, key)) return undefined;
  const vars: Record<string, string> = { ...coachCopyVars(merged, locale) };
  const pct = merged['pct'];
  if (typeof pct === 'number') {
    vars['share'] =
      pct < 1 ? all.coachShare.underOne : fill(all.coachShare.around, { pct: vars['pct'] ?? '' });
  }
  return fill(questions[key]!, vars);
}

/** True when the key carries nutrient numbers (so it is hidden while numbers are off). */
export const coachKeyHasNumbers = (questionKey: string): boolean =>
  Object.keys(splitQuestionKey(questionKey).params).some((key) => key !== 'lang');
