/**
 * How a food and a portion read in the person's language.
 *
 * A seed food is stored by its frozen `sourceRef` (see `seed-foods.ts`), so its name comes from the
 * catalogue at display time; anything else (an Open Food Facts product, a model's food, a typed
 * name) keeps the text it was logged with. A portion is worded from `(low, high, unit)` with the
 * locale's unit names and number format ("~1,5 tasse", "~1–2 tasses"), but only for units the
 * catalogue knows: a model's free-text hint ("about 2 fists") is not rebuilt, the stored
 * `displayLabel` stays. A preset also carries its weight in grams (an estimate, docs/adr/0006); the
 * gram-based presets of CIQUAL foods and Open Food Facts products are worded here too.
 */
import { gramsQuantity, type DatabaseFood, type QuantityRange } from '@anc/core';
import { currentLocale, plural, type PluralForms } from '../i18n';
import { catalogueFor } from '../i18n/catalogues';
import { perLocale, type Locale } from '../i18n/locale';
import { portionsFor, PER_100_G, type PortionKind } from './ciqual-portions';
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
    const q = { low: preset.low, high: preset.high, unit: preset.unit, displayLabel: '' };
    // An id the catalogue has no unit for (only a test's seed) still gets a readable label.
    return {
      ...q,
      displayLabel: quantityLabel(q, locale) || `~${preset.unit}`,
      ...(preset.grams !== undefined ? { grams: preset.grams, gramsEstimated: true } : {}),
    };
  });
}

const portionStrings = (locale: Locale): Readonly<Record<string, string | undefined>> =>
  catalogueFor(locale).foods.portions;

/** The label carries no figure: the grams are on the preset and the UI shows them beside it. */
const gramsLabel = (key: string, _grams: number, locale: Locale): string =>
  portionStrings(locale)[key] ?? key;

/** "100 g": an exact amount the person chose, so not flagged as a guess. */
const per100Preset = (locale: Locale): QuantityRange =>
  gramsQuantity(PER_100_G, {
    estimated: false,
    displayLabel: portionStrings(locale)['per100'] ?? '100 g',
  });

/**
 * Presets of a CIQUAL food: the typical portions of its sub-group (an estimate, `~`), then "100 g".
 */
export function ciqualPresets(
  subgroupCode: string | undefined,
  locale: Locale = currentLocale(),
): readonly QuantityRange[] {
  const portions = portionsFor(subgroupCode).map(([kind, grams]: readonly [PortionKind, number]) =>
    gramsQuantity(grams, { estimated: true, displayLabel: gramsLabel(kind, grams, locale) }),
  );
  return [...portions, per100Preset(locale)];
}

/**
 * Presets of an Open Food Facts product: its serving, "100 g", and the whole pack (when the product
 * says one, up to 2 kg / 2 L). The amounts are the producer's own, still flagged as estimates.
 */
export function offPresets(
  amounts: { readonly servingGrams?: number | undefined; readonly packGrams?: number | undefined },
  locale: Locale = currentLocale(),
): readonly QuantityRange[] {
  const out: QuantityRange[] = [];
  if (amounts.servingGrams !== undefined) {
    out.push(
      gramsQuantity(amounts.servingGrams, {
        estimated: true,
        displayLabel: gramsLabel('serving', amounts.servingGrams, locale),
      }),
    );
  }
  out.push(per100Preset(locale));
  if (amounts.packGrams !== undefined && amounts.packGrams !== amounts.servingGrams) {
    out.push(
      gramsQuantity(amounts.packGrams, {
        estimated: true,
        displayLabel: gramsLabel('pack', amounts.packGrams, locale),
      }),
    );
  }
  return out;
}
