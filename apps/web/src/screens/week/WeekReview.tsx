import { useMemo } from 'react';
import { weeklyReview, type WeeklyHighlight } from '@anc/core';
import { coachCopyVars } from '../../app/coach-copy';
import { useDay } from '../../app/day-context';
import { foodGroupsOfFood } from '../../catalog';
import { hasNutrition, NutrientBars, useShowNumbers, useTargets } from '../../components/nutrition';
import { fill, plural, useLocale, useStrings } from '../../i18n';
import { WeekAiSummary } from './WeekAiSummary';

/**
 * "The week, in short": how many days have meals logged (a count, never a run), the daily average
 * of each nutrient over the days that have data, up to two things that went well and one thing to
 * try. Rule-based, no score. The nutrient bars and every line that quotes grams are hidden while
 * numbers are turned off; the day count and the veg-days line stay.
 */
export function WeekReview({ className }: { readonly className?: string }) {
  const all = useStrings();
  const { locale } = useLocale();
  const { plates } = useDay();
  const targets = useTargets();
  const showNumbers = useShowNumbers();
  const t = all.week.review;
  const review = useMemo(
    () => weeklyReview({ plates, targets, groupsOf: foodGroupsOfFood }),
    [plates, targets],
  );
  if (review.daysLogged === 0) return null;

  const words = (
    group: 'positives' | 'suggestions',
    item: WeeklyHighlight<string>,
  ): string | null => {
    // A line quoting grams waits while numbers are off.
    if (!showNumbers && 'g' in item.params) return null;
    const copy = (t[group] as Readonly<Record<string, string>>)[item.key];
    if (copy === undefined) return null;
    return fill(copy, coachCopyVars({ ...item.params, est: review.estimated ? 1 : 0 }, locale));
  };
  const wentWell = review.wentWell.flatMap((item) => words('positives', item) ?? []);
  const tryNext = review.tryNext === null ? null : words('suggestions', review.tryNext);
  const bars = {
    totals: review.averages,
    entriesCounted: review.daysWithData,
    entriesTotal: review.daysWithData,
    estimated: review.estimated,
  };
  const showBars = showNumbers && review.daysWithData > 0 && hasNutrition(bars);

  return (
    <section aria-labelledby="week-review-title" className={className}>
      <h2 id="week-review-title" className="font-display text-section text-thread mb-2">
        {t.title}
      </h2>
      <p className="text-lead">{plural(t.daysLogged, review.daysLogged, locale)}</p>
      {showBars && (
        <div className="mt-4">
          <h3 className="text-lead mb-1 font-semibold">{t.averagesTitle}</h3>
          <p className="text-body-small text-ink-soft mb-2">
            {plural(t.averagesNote, review.daysWithData, locale)}
          </p>
          <NutrientBars nutrition={bars} targets={targets} />
        </div>
      )}
      {wentWell.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lead mb-1 font-semibold">{t.wentWellTitle}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-lead">
            {wentWell.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {tryNext !== null && (
        <div className="mt-4">
          <h3 className="text-lead mb-1 font-semibold">{t.tryTitle}</h3>
          <p className="text-lead">{tryNext}</p>
        </div>
      )}
      <WeekAiSummary review={review} />
    </section>
  );
}
