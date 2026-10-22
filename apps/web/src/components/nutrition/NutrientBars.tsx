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
      <ul aria-label={t.barsLabel} className="flex flex-col">
        {present.map((key) => {
          const value = nutrition.totals[key] ?? 0;
          const reference = targets[key];
          const percent = Math.round((value / reference) * 100);
          // Above zero but under half a percent: say so instead of "about 0%".
          const underOne = value > 0 && percent === 0;
          const sub = SUB_ROWS.has(key);
          return (
            <li key={key} className="border-seam border-b py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn('text-lead', sub && 'text-ink-soft pl-4')}>{t.names[key]}</span>
                <span className="font-display quantity text-quantity font-semibold whitespace-nowrap">
                  {formatNutrient(key, value, nutrition.estimated, locale)}
                </span>
              </div>
              {/* A thread pulled across a seam: one neutral colour for every nutrient and amount. */}
              <div aria-hidden="true" className="weave-bare relative mt-2 h-1">
                <div
                  className="bg-ink-soft absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${barFill(value, reference) * 100}%` }}
                />
                <div className="bg-ink absolute -inset-y-1 right-0 w-px" />
              </div>
              <p className="text-body-small text-thread mt-1">
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
        <p className="text-body-small text-ink-soft">
          {fill(plural(t.coverage, nutrition.entriesCounted, locale), { missing })}
        </p>
      )}
      <details className="group text-body-small text-ink-soft">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-3 underline underline-offset-4 [&::-webkit-details-marker]:hidden">
          {/* A drawn chevron in place of the browser's triangle; it turns down when open. */}
          <span
            aria-hidden="true"
            className="border-ink-soft size-2 shrink-0 -rotate-45 border-r-2 border-b-2 transition-transform group-open:rotate-45"
          />
          <span>{t.whatAre}</span>
        </summary>
        <p className="pb-2">{personal ? t.whatAreBodyPersonal : t.whatAreBody}</p>
        <SupportLine className="pb-2" />
      </details>
    </div>
  );
}
