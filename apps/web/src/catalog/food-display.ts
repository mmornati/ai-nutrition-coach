/**
 * How a food and a portion read in the person's language.
 *
 * A seed food is stored by its frozen `sourceRef` (see `seed-foods.ts`), so its name comes from the
 * catalogue at display time; anything else (an Open Food Facts product, a model's food, a typed
 * name) keeps the text it was logged with. A portion is worded from `(low, high, unit)` with the
 * locale's unit names and number format ("~1,5 tasse", "~1–2 tasses"), but only for units the
 * catalogue knows: a model's free-text hint ("about 2 fists") is not rebuilt, the stored
 * `displayLabel` stays. The label is a portion range; grams and nutrient values arrive in schema v2 (docs/adr/0006).
 */
import type { DatabaseFood, QuantityRange } from '@anc/core';
import { currentLocale, plural, type PluralForms } from '../i18n';
import { catalogueFor } from '../i18n/catalogues';
import { perLocale, type Locale } from '../i18n/locale';
import { seedForRef, type SeedFood, type SeedPreset } from './seed-foods';

/** The seed's name in `locale` (its English name when a language lacks it, then its id). */
export function seedName(seed: SeedFood, locale: Locale = currentLocale()): string {
  const names = (l: Locale): Readonly<Record<string, string | undefined>> =>
    catalogueFor(l).foods.names;
  return names(locale)[seed.id] ?? names('en')[seed.id] ?? seed.id;
}

/** The name to show for a logged or suggested food: the catalogue's for a seed, else its own. */
export function foodName(food: DatabaseFood, locale: Locale = currentLocale()): string {
  const seed = food.sourceRef.startsWith('seed:') ? seedForRef(food.sourceRef) : undefined;
  return seed === undefined ? food.displayName : seedName(seed, locale);
}

const unitForms = (unit: string, locale: Locale): PluralForms | undefined => {
  const units: Readonly<Record<string, PluralForms | undefined>> = catalogueFor(locale).foods.units;
  return Object.hasOwn(units, unit) ? units[unit] : undefined;
};

/** Whether `unit` is one the catalogue words (a seed or placeholder unit, not a model's free text). */
export const isKnownUnit = (unit: string): boolean =>
  unitForms(unit, currentLocale()) !== undefined;

const numberFormat = perLocale(
  (tag) => new Intl.NumberFormat(tag, { maximumFractionDigits: 2, useGrouping: false }),
);

/** `1`, `1,5` (French), and the half as ½ in every language. */
const formatNumber = (n: number, locale: Locale): string =>
  n === 0.5 ? '½' : numberFormat(locale).format(n);

/**
 * "~2 fists", "~1–2 cups", "~½–1 cup". The unit takes the plural form of the top of the range
 * ("1,5 tasse" is singular in French, "1.5 fists" plural in English). A unit the catalogue does not
 * know keeps the label it was stored with.
 */
export function quantityLabel(q: QuantityRange, locale: Locale = currentLocale()): string {
  const forms = unitForms(q.unit, locale);
  if (forms === undefined) return q.displayLabel;
  const range =
    q.low === q.high
      ? formatNumber(q.low, locale)
      : `${formatNumber(q.low, locale)}–${formatNumber(q.high, locale)}`;
  return `~${range} ${plural(forms, q.high, locale)}`;
}

/** A seed's presets as quantities, labelled in `locale` (what is shown, and kept when logged). */
export function seedPresets(
  seed: SeedFood,
  locale: Locale = currentLocale(),
): readonly QuantityRange[] {
  return seed.presets.map((preset: SeedPreset) => {
    const q = { ...preset, displayLabel: '' };
    // An id the catalogue has no unit for (only a test's seed) still gets a readable label.
    return { ...q, displayLabel: quantityLabel(q, locale) || `~${preset.unit}` };
  });
}
