import {
  NUTRIENT_KEYS,
  EU_REFERENCE_INTAKES,
  type DailyTargets,
  type NutrientKey,
  type NutrientTotals,
} from '@anc/core';
import { fill, plural, useLocale, useStrings } from '../../i18n';
import { cn } from '../primitives/cn';
import { formatNutrient, formatReference, formatWhole } from './format';
import { SupportLine } from './SupportLine';

/** The two sub-rows that sit under their parent nutrient. */
const SUB_ROWS: ReadonlySet<NutrientKey> = new Set(['sugars', 'saturatedFat']);

/** Display order: energy, protein, carbohydrate, sugars, fat, saturated fat, fibre, salt. */
export const NUTRIENT_ORDER: readonly NutrientKey[] = [
  'energyKcal',
  'protein',
  'carbohydrate',
  'sugars',
  'fat',
  'saturatedFat',
  'fibre',
  'salt',
];

/** The fraction of the reference the bar fills: clamped at the track end, never more. */
export const barFill = (value: number, reference: number): number =>
  Math.min(Math.max(value / reference, 0), 1);

/** Whether a nutrition result has anything to draw. */
export const hasNutrition = (nutrition: NutrientTotals): boolean =>
  NUTRIENT_KEYS.some((key) => nutrition.totals[key] !== undefined);

/**
 * Nutrient Bars (DESIGN.md): one row per nutrient that has data. The name, the value with its unit
 * and the reference are always text; the bar is a plain neutral graphic (`aria-hidden`) in ONE
 * colour for every nutrient and every amount, so a value past the reference only fills the track
 * and says its number. No red, no warning, no "over". Not a `progressbar`.
 */
export function NutrientBars({
  nutrition,
  targets = EU_REFERENCE_INTAKES,
}: {
  readonly nutrition: NutrientTotals;
  /** The daily guide the bars are drawn against; the EU reference intakes by default. */
  readonly targets?: DailyTargets;
}) {
  const personal = targets !== EU_REFERENCE_INTAKES;
  const all = useStrings();
  const { locale } = useLocale();
  const t = all.nutrition;
  const present = NUTRIENT_ORDER.filter((key) => nutrition.totals[key] !== undefined);
  if (present.length === 0) return null;
  const missing = nutrition.entriesTotal - nutrition.entriesCounted;
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={t.barsLabel} className="border-porcelain flex flex-col border-t-2">
        {present.map((key) => {
          const value = nutrition.totals[key] ?? 0;
          const reference = targets[key];
          const percent = Math.round((value / reference) * 100);
          // Above zero but under half a percent: say so instead of "about 0%".
          const underOne = value > 0 && percent === 0;
          const sub = SUB_ROWS.has(key);
          return (
            <li key={key} className="border-rule border-b py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn('text-lead', sub && 'text-porcelain-dim pl-4')}>
                  {t.names[key]}
                </span>
                <span className="font-display quantity text-quantity font-semibold whitespace-nowrap">
                  {formatNutrient(key, value, nutrition.estimated, locale)}
                </span>
              </div>
              <div aria-hidden="true" className="bg-rule relative mt-1.5 h-2">
                <div
                  className="bg-porcelain-dim absolute inset-y-0 left-0"
                  style={{ width: `${barFill(value, reference) * 100}%` }}
                />
                <div className="bg-porcelain absolute inset-y-0 right-0 w-px" />
              </div>
              <p className="text-body-small text-signal-muted mt-1">
                {fill(
                  underOne
                    ? personal
                      ? t.referenceUnderOnePersonal
                      : t.referenceUnderOne
                    : personal
                      ? t.referencePersonal
                      : t.reference,
                  {
                    percent: formatWhole(percent, locale),
                    reference: formatReference(key, reference, locale),
                  },
                )}
              </p>
            </li>
          );
        })}
      </ul>
      {missing > 0 && (
        <p className="text-body-small text-porcelain-dim">
          {fill(plural(t.coverage, nutrition.entriesCounted, locale), { missing })}
        </p>
      )}
      <details className="text-body-small text-porcelain-dim">
        <summary className="min-h-12 cursor-pointer py-3 underline underline-offset-4">
          {t.whatAre}
        </summary>
        <p className="pb-2">{personal ? t.whatAreBodyPersonal : t.whatAreBody}</p>
        <SupportLine className="pb-2" />
      </details>
    </div>
  );
}
