import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  addCalendarDays,
  coachGoalContext,
  slotParams,
  stepOfferForWeekly,
  weeklyReview,
  type StepOffer,
  type WeeklyHighlight,
} from '@anc/core';
import { coachCopyVars, copyTemplate, fillFoodSlots, slotsOfTemplate } from '../../app/coach-copy';
import { useDay } from '../../app/day-context';
import { useSession } from '../../app/session';
import { stepLabel } from '../../app/step-copy';
import { foodGroupsOfFood } from '../../catalog';
import { Button, QuietButton } from '../../components/primitives';
import { hasNutrition, NutrientBars, useShowNumbers, useTargets } from '../../components/nutrition';
import { formatWhole } from '../../components/nutrition/format';
import { fill, plural, useLocale, useStrings, type PluralForms } from '../../i18n';
import { intlTag, type Locale } from '../../i18n/locale';
import { useWeightProgress } from '../progress/use-weight-progress';
import { WeekAiSummary } from './WeekAiSummary';

/** Names joined as a sentence in the language ("A, B and C"). */
const list = (names: readonly string[], tag: string): string =>
  new Intl.ListFormat(tag, { type: 'conjunction' }).format(names);

/** The figures a week line may quote; with numbers off such a line needs its own variant. */
const FIGURES = ['g', 'kcal'] as const;

/**
 * "The week, in short": how many days have meals logged (a count, never a run), the daily average
 * of each nutrient over the finished days with enough logged (today and thin days are left out,
 * and the copy says how many of each), up to two things that went well and one thing to
 * try. Rule-based, no score. The nutrient bars and every line that quotes grams are hidden while
 * numbers are turned off; the day count and the veg-days line stay.
 *
 * With a personal guide it also describes the week's energy against it, neutrally; with a weight
 * goal and weigh-ins it relates the weight trend to the logged energy, descriptively and never as a
 * verdict; it says one neutral thing about the food itself (pulses, fish, cured or red meat ...);
 * and it looks back, from the logged meals, at the one step the person accepted.
 */
export function WeekReview({ className }: { readonly className?: string }) {
  const all = useStrings();
  const { locale } = useLocale();
  const { plates, today: now, viewEnd, viewingEarlierWeek } = useDay();
  const { profile: profilePref, step: stepPref, clock } = useSession();
  // An earlier week is all finished days: nothing in it is "still being logged".
  const today = viewingEarlierWeek ? addCalendarDays(viewEnd, 1) : now;
  const targets = useTargets();
  const showNumbers = useShowNumbers();
  const profile = useSyncExternalStore(profilePref.subscribe, profilePref.current);
  const guide = useSyncExternalStore(profilePref.subscribe, profilePref.guide);
  const activeStep = useSyncExternalStore(stepPref.subscribe, stepPref.current);
  const progress = useWeightProgress();
  const [stepFailed, setStepFailed] = useState(false);
  const t = all.week.review;
  const goal = useMemo(() => coachGoalContext(profile, guide, true), [profile, guide]);
  const weightChange = viewingEarlierWeek ? null : progress.changeFourWeeks;
  const step = viewingEarlierWeek ? null : activeStep;
  const review = useMemo(
    () =>
      weeklyReview({
        plates,
        today,
        targets,
        groupsOf: foodGroupsOfFood,
        goal,
        profile,
        step,
        weightChange,
      }),
    [plates, today, targets, goal, profile, step, weightChange],
  );
  if (review.daysLogged === 0) return null;

  const tag = intlTag(locale);
  const slotsFor = (template: string): Readonly<Record<string, string>> =>
    slotParams(slotsOfTemplate(template), profile);
  const words = (
    group: 'positives' | 'suggestions',
    item: WeeklyHighlight<string>,
  ): string | null => {
    const hasFigure = FIGURES.some((f) => f in item.params);
    // A line quoting grams or kcal waits while numbers are off, unless it has a figure-free variant.
    const copies = t[group] as Readonly<Record<string, string | PluralForms>>;
    const noNumbers = t.suggestionsNoNumbers as Readonly<Record<string, string | PluralForms>>;
    const raw =
      !showNumbers && hasFigure && group === 'suggestions' ? noNumbers[item.key] : copies[item.key];
    if (raw === undefined) return null;
    if (!showNumbers && hasFigure && group !== 'suggestions') return null;
    // The number of days or meals the line counts ("of") decides "1 logged day" or "6 logged days".
    const copy = copyTemplate(raw, Number(item.params['of'] ?? 0), locale);
    return fillFoodSlots(
      all,
      copy,
      coachCopyVars({ ...item.params, est: review.estimated ? 1 : 0 }, locale),
      slotsFor(copy),
      locale,
    );
  };
  const wentWell = review.wentWell.flatMap((item) => words('positives', item) ?? []);
  const tryNext = review.tryNext === null ? null : words('suggestions', review.tryNext);
  const bars = {
    totals: review.averages,
    entriesCounted: review.countedDays,
    entriesTotal: review.countedDays,
    gaps: review.gaps,
    uncoveredShare: review.uncoveredShare,
    unweighed: review.unweighed,
    uncounted: [],
    estimated: review.estimated,
  };
  const showBars = showNumbers && review.countedDays > 0 && hasNutrition(bars);

  const energyLine = (() => {
    const e = review.energy;
    if (e === null) return null;
    const relation = t.energy.relation[e.relation];
    return showNumbers
      ? fill(plural(t.energy.line, e.days, locale), {
          days: formatWhole(e.days, locale),
          avg: formatWhole(e.avgKcal, locale),
          guide: formatWhole(e.guideKcal, locale),
          relation,
        })
      : fill(plural(t.energy.lineNoNumbers, e.days, locale), {
          days: formatWhole(e.days, locale),
          relation,
        });
  })();
  const energyFoods =
    review.energy !== null && review.energyFoods.length > 0
      ? fill(t.energy.foods, { foods: list(review.energyFoods, tag) })
      : null;
  const weightLine = (() => {
    const w = review.weightLine;
    if (w === null) return null;
    const weekCount = Math.round(w.days / 7);
    const weeks = formatWhole(weekCount, locale);
    const base =
      w.direction === 'steady'
        ? fill(plural(t.weightLine.steady, weekCount, locale), { weeks })
        : showNumbers
          ? fill(plural(t.weightLine[w.direction], weekCount, locale), {
              kg: kgText(w.kg, locale),
              weeks,
            })
          : fill(
              plural(
                t.weightLine[w.direction === 'lower' ? 'lowerNoNumbers' : 'higherNoNumbers'],
                weekCount,
                locale,
              ),
              { weeks },
            );
    const tail =
      w.intake === 'near'
        ? t.weightLine.intakeNear
        : w.intake === 'above'
          ? t.weightLine.intakeAbove
          : w.intake === 'below'
            ? t.weightLine.intakeBelow
            : t.weightLine.end;
    return { text: `${base}${tail}`, mismatch: w.mismatch ? t.weightLine.mismatch : null };
  })();

  const quality = review.quality;
  const qualityText =
    quality === null
      ? null
      : fill(
          copyTemplate(
            (t.quality as Readonly<Record<string, string | PluralForms>>)[quality.key] ?? '',
            Number(quality.params['of'] ?? 0),
            locale,
          ),
          coachCopyVars(quality.params, locale),
        );
  const offerFor = (
    key: string,
    params: Readonly<Record<string, number | string>>,
  ): StepOffer | null =>
    activeStep !== null || viewingEarlierWeek
      ? null
      : stepOfferForWeekly(key as Parameters<typeof stepOfferForWeekly>[0], params);
  const qualityOffer = quality === null ? null : offerFor(quality.key, quality.params);
  const tryOffer =
    review.tryNext === null ? null : offerFor(review.tryNext.key, review.tryNext.params);

  const accept = (offer: StepOffer) => {
    stepPref.accept(offer, clock()).then(
      () => setStepFailed(false),
      () => setStepFailed(true),
    );
  };
  const run = (action: () => Promise<void>) => {
    action().then(
      () => setStepFailed(false),
      () => setStepFailed(true),
    );
  };

  const stepText = (() => {
    if (step === null) return null;
    const r = review.stepReview;
    const name = stepLabel(all, step);
    if (r !== null) {
      const copy = (t.stepReview as Readonly<Record<string, string | PluralForms>>)[r.id];
      if (copy !== undefined) {
        return fill(copyTemplate(copy, r.of, locale), {
          matched: formatWhole(r.matched, locale),
          of: formatWhole(r.of, locale),
        });
      }
    }
    const noData = step.id === 'smallerPortion' || step.id === 'fruitSnack';
    return fill(noData ? t.stepReview.noData : t.stepReview.notYet, { step: name });
  })();
  const stepStrings = all.coachStep;
  const tryButton = (offer: StepOffer | null) =>
    offer === null ? null : (
      <Button variant="secondary" className="mt-1" onClick={() => accept(offer)}>
        {stepStrings.offer}
      </Button>
    );

  return (
    <section aria-labelledby="week-review-title" className={className}>
      <h2 id="week-review-title" className="font-display text-section text-thread mb-2">
        {t.title}
      </h2>
      <p className="text-lead">{plural(t.daysLogged, review.daysLogged, locale)}</p>
      {energyLine !== null && <p className="text-lead mt-2">{energyLine}</p>}
      {energyFoods !== null && <p className="text-lead mt-2">{energyFoods}</p>}
      {weightLine !== null && (
        <>
          <p className="text-lead mt-2">{weightLine.text}</p>
          {weightLine.mismatch !== null && (
            <p className="text-body-small text-ink-soft mt-1">{weightLine.mismatch}</p>
          )}
        </>
      )}
      {showNumbers && !showBars && (
        <p className="text-body-small text-ink-soft mt-4">{t.averagesNone}</p>
      )}
      {showBars && (
        <div className="mt-4">
          <h3 className="text-lead mb-1 font-semibold">{t.averagesTitle}</h3>
          <p className="text-body-small text-ink-soft mb-2">
            {plural(t.averagesNote, review.countedDays, locale)}
            {review.excludedDays > 0 &&
              ` ${plural(t.averagesExcluded, review.excludedDays, locale)}`}
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
      {qualityText !== null && qualityText !== '' && (
        <div className="mt-4">
          <h3 className="text-lead mb-1 font-semibold">{t.qualityTitle}</h3>
          <p className="text-lead">{qualityText}</p>
          {tryButton(qualityOffer)}
        </div>
      )}
      {tryNext !== null && (
        <div className="mt-4">
          <h3 className="text-lead mb-1 font-semibold">{t.tryTitle}</h3>
          <p className="text-lead">{tryNext}</p>
          {tryButton(tryOffer)}
        </div>
      )}
      {stepText !== null && (
        <div className="mt-4">
          <h3 className="text-lead mb-1 font-semibold">{t.stepTitle}</h3>
          <p className="text-lead">{stepText}</p>
          <div className="flex flex-wrap gap-x-4">
            <QuietButton onClick={() => run(() => stepPref.renew(clock()))}>
              {stepStrings.keep}
            </QuietButton>
            <QuietButton onClick={() => run(() => stepPref.clear())}>
              {stepStrings.change}
            </QuietButton>
            <QuietButton onClick={() => run(() => stepPref.clear())}>
              {stepStrings.drop}
            </QuietButton>
          </div>
        </div>
      )}
      <p role="status" className="text-body-small text-ink-soft mt-1 empty:hidden">
        {stepFailed ? stepStrings.saveFailed : ''}
      </p>
      <WeekAiSummary key={viewEnd} review={review} />
    </section>
  );
}

/** A weight change in kilograms with one decimal, in the language ("0.3", "0,3"). */
function kgText(kg: number, locale: Locale): string {
  return new Intl.NumberFormat(intlTag(locale), { maximumFractionDigits: 1 }).format(kg);
}
