import type { NutrientTotals } from '@anc/core';
import { hasNutrition, NutrientBars } from './NutrientBars';
import { useShowNumbers } from './use-show-numbers';
import { useTargets } from './use-targets';

/**
 * A titled block of Nutrient Bars. Draws nothing when the person turned numbers off or when no
 * entry has nutrition data, so a plate or day without data shows no empty section.
 */
export function NutritionSection({
  title,
  nutrition,
  className,
}: {
  readonly title: string;
  readonly nutrition: NutrientTotals;
  readonly className?: string;
}) {
  const show = useShowNumbers();
  const targets = useTargets();
  if (!show || !hasNutrition(nutrition)) return null;
  return (
    <section className={className}>
      <h2 className="font-display text-section text-signal-muted mb-2 uppercase">{title}</h2>
      <NutrientBars nutrition={nutrition} targets={targets} />
    </section>
  );
}
