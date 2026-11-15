import { isPartial, type FoodEntry, type NutrientKey, type NutrientTotals } from '@anc/core';
import { fill, plural, useLocale, useStrings } from '../../i18n';
import { formatNutrient } from './format';
import { hasNutrition, NutrientBars } from './NutrientBars';
import { useShowNumbers } from './use-show-numbers';
import { useTargets } from './use-targets';

/**
 * A titled block of Nutrient Bars. Draws nothing when the person turned numbers off or when no
 * entry has nutrition data, so a plate or day without data shows no empty section.
 */
/** The headline totals, set large above the bars. */
const SUMMARY: readonly NutrientKey[] = ['energyKcal', 'protein', 'fibre'];

export function NutritionSection({
  title,
  nutrition,
  className,
  fixHref,
  distance = false,
}: {
  readonly title: string;
  readonly nutrition: NutrientTotals;
  readonly className?: string;
  /** Where to complete a food without a weight or nutrition (see NutrientBars). */
  readonly fixHref?: ((entry: FoodEntry) => string) | undefined;
  /** A whole day's totals: the opt-in distance line may show under the energy bar. */
  readonly distance?: boolean;
}) {
  const show = useShowNumbers();
  const targets = useTargets();
  const t = useStrings().nutrition;
  const { locale } = useLocale();
  if (!show || !hasNutrition(nutrition)) return null;
  const headline = SUMMARY.filter((key) => nutrition.totals[key] !== undefined);
  return (
    <section className={className}>
      <h2 className="font-display text-section text-thread mb-2">{title}</h2>
      {/* The headline row repeats three values from the bars below for the eye; assistive tech
          reads them once, in the bars. */}
      {headline.length > 0 && (
        <div
          aria-hidden="true"
          className="border-t-ink border-b-seam mb-1 flex flex-wrap gap-x-8 gap-y-2 border-t-2 border-b py-3"
        >
          {headline.map((key) => (
            <div key={key} className="flex flex-col">
              <span className="text-body-small text-ink-soft">{t.names[key]}</span>
              <span className="font-display quantity text-title font-extrabold whitespace-nowrap">
                {formatNutrient(
                  key,
                  nutrition.totals[key] ?? 0,
                  nutrition.estimated,
                  locale,
                  isPartial(nutrition, key),
                )}
              </span>
              {key === 'energyKcal' && nutrition.uncounted.length > 0 && (
                <span className="text-body-small text-ink-soft">
                  {fill(plural(t.notCounted, nutrition.uncounted.length, locale), {
                    count: nutrition.uncounted.length,
                  })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <NutrientBars nutrition={nutrition} targets={targets} fixHref={fixHref} distance={distance} />
    </section>
  );
}
