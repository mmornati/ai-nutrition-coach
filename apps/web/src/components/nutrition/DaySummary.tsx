import { isPartial, type NutrientTotals } from '@anc/core';
import { fill, plural, useLocale, useStrings } from '../../i18n';
import { formatNutrient, formatReference, formatWhole } from './format';
import { barFill, hasNutrition, REFERENCE_TICK } from './NutrientBars';
import { useShowNumbers } from './use-show-numbers';
import { isPersonal, useTargets } from './use-targets';

/** The id the full nutrition section carries, so the summary can take the person down to it. */
export const DAY_NUTRITION_ID = 'day-nutrition';

/**
 * The day so far, compact, at the top of Today: energy against the daily guide (the same neutral
 * thread and tick as the Nutrient Bars, the percentage in text), protein and fibre, and the honest
 * "at least" and "not counted" notes. One neutral colour; no "remaining", no verdict. The opt-in
 * distance line stays under the full energy bar. Nothing renders with numbers off or no data.
 * "All nutrients" moves focus to the full section below.
 */
export function DaySummary({
  nutrition,
  className,
}: {
  readonly nutrition: NutrientTotals;
  readonly className?: string;
}) {
  const show = useShowNumbers();
  const targets = useTargets();
  const all = useStrings();
  const t = all.nutrition;
  const { locale } = useLocale();
  if (!show || !hasNutrition(nutrition)) return null;
  const personal = isPersonal(targets);
  const energy = nutrition.totals.energyKcal;
  const percent = energy === undefined ? 0 : Math.round((energy / targets.energyKcal) * 100);
  const rest = (['protein', 'fibre'] as const).filter((key) => nutrition.totals[key] !== undefined);
  const value = (key: 'energyKcal' | 'protein' | 'fibre') =>
    formatNutrient(
      key,
      nutrition.totals[key] ?? 0,
      nutrition.estimated,
      locale,
      isPartial(nutrition, key),
    );
  const jump = () => {
    const target = document.getElementById(DAY_NUTRITION_ID);
    if (target === null) return;
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  };
  return (
    <section aria-label={all.today.summaryLabel} className={className}>
      <div className="border-ink border-t-2 pt-3">
        {energy !== undefined && (
          <>
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-lead">{t.names.energyKcal}</span>
              <span className="font-display quantity text-title font-extrabold whitespace-nowrap">
                {value('energyKcal')}
              </span>
            </p>
            <div aria-hidden="true" className="weave-bare relative mt-2 h-1">
              <div
                className="bg-ink-soft absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${barFill(energy, targets.energyKcal) * 100}%` }}
              />
              <div
                className="bg-ink absolute -inset-y-1 w-px"
                style={{ left: `${REFERENCE_TICK * 100}%` }}
              />
            </div>
            <p className="text-body-small text-thread mt-1">
              {fill(
                energy > 0 && percent === 0
                  ? personal
                    ? t.referenceUnderOnePersonal
                    : t.referenceUnderOne
                  : personal
                    ? t.referencePersonal
                    : t.reference,
                {
                  percent: formatWhole(percent, locale),
                  reference: formatReference('energyKcal', targets.energyKcal, locale),
                },
              )}
            </p>
          </>
        )}
        {(rest.length > 0 || nutrition.uncounted.length > 0) && (
          <p className="text-body-small text-ink-soft mt-2">
            {rest.map((key) => `${t.names[key]} ${value(key)}`).join(' · ')}
            {nutrition.uncounted.length > 0 &&
              `${rest.length > 0 ? ' · ' : ''}${fill(
                plural(t.notCounted, nutrition.uncounted.length, locale),
                { count: nutrition.uncounted.length },
              )}`}
          </p>
        )}
        <button
          type="button"
          onClick={jump}
          className="text-ink-soft text-body-small -mb-1 inline-flex min-h-12 cursor-pointer items-center bg-transparent underline underline-offset-4"
        >
          {all.today.summaryMore}
        </button>
      </div>
    </section>
  );
}
