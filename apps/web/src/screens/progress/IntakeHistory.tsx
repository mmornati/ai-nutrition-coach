import { useMemo } from 'react';
import {
  EU_REFERENCE_INTAKES,
  addCalendarDays,
  dayNutrients,
  isPartial,
  localDayText,
  startOfNextLocalDay,
  type EpochMs,
  type NutrientKey,
  type NutrientTotals,
  type PlateLog,
} from '@anc/core';
import { formatDayMonth, weekdayName } from '../../components/day/format';
import { barFill, REFERENCE_TICK } from '../../components/nutrition/NutrientBars';
import { formatNutrient, formatReference, useTargets } from '../../components/nutrition';
import { capitalise, fill, useLocale, useStrings } from '../../i18n';
import { useDay } from '../../app/day-context';
import { useRangePlates } from '../../app/range-plates';
import { hrefs } from '../../app/router';
import { RANGE_DAYS, type RangeKey } from './chart-model';

/** The most days the history reads and lists, whatever the range: a bounded read, not the whole store. */
export const MAX_INTAKE_DAYS = 90;

const SHOWN: readonly NutrientKey[] = ['energyKcal', 'protein'];

/** One day's totals and the plates behind them, for the days of `[from, today]`, newest first. */
export function intakeByDay(
  plates: readonly PlateLog[],
  today: EpochMs,
  days: number,
): readonly { readonly date: EpochMs; readonly totals: NutrientTotals | null }[] {
  const byDay = new Map<string, PlateLog[]>();
  for (const plate of plates) {
    const key = localDayText(plate.loggedAtUtc);
    const list = byDay.get(key);
    if (list) list.push(plate);
    else byDay.set(key, [plate]);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = addCalendarDays(today, -i);
    const list = byDay.get(localDayText(date));
    return { date, totals: list === undefined ? null : dayNutrients(list) };
  });
}

/**
 * Energy and protein for each day of the range, newest first, against the daily guide (the tick,
 * drawn as in the Nutrient Bars: one neutral colour, the value always in text). A total that leaves
 * foods out reads "at least"; a day with nothing logged is left empty, never shown as zero. Each day
 * links to that day on Today.
 */
export function IntakeHistory({ range }: { readonly range: RangeKey }) {
  const all = useStrings();
  const s = all.progress;
  const { locale } = useLocale();
  const day = useDay();
  const targets = useTargets();
  const wanted = RANGE_DAYS[range] ?? MAX_INTAKE_DAYS;
  const days = Math.min(wanted, MAX_INTAKE_DAYS);
  const capped = RANGE_DAYS[range] === null || wanted > MAX_INTAKE_DAYS;
  const from = addCalendarDays(day.today, -(days - 1));
  const { plates, status } = useRangePlates(from, startOfNextLocalDay(day.today));
  const rows = useMemo(() => intakeByDay(plates, day.today, days), [plates, day.today, days]);
  const personal = targets !== EU_REFERENCE_INTAKES;
  if (status === 'failed') {
    return <p className="text-body-small text-ink-soft">{all.today.historyCannotLoad}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-small text-ink-soft">
        {personal ? s.intakeIntroPersonal : s.intakeIntroReference}
        {capped ? ` ${fill(s.intakeCapped, { count: days })}` : ''}
      </p>
      {status === 'ready' && (
        <ul className="border-ink flex flex-col border-t-2">
          {rows.map(({ date, totals }) => {
            const label = `${capitalise(weekdayName(date))} ${formatDayMonth(date)}`;
            const known = SHOWN.filter((key) => totals?.totals[key] !== undefined);
            return (
              <li key={date} className="border-seam border-b py-1">
                <a
                  href={hrefs.today}
                  aria-label={fill(s.intakeOpenDay, { date: label })}
                  onClick={() => day.showDay(date)}
                  className="text-ink inline-flex min-h-12 items-center text-lead underline underline-offset-4"
                >
                  {label}
                </a>
                {totals === null ? (
                  <p className="text-body-small text-ink-soft pb-2">{s.intakeNothing}</p>
                ) : known.length === 0 ? (
                  <p className="text-body-small text-ink-soft pb-2">{s.intakeNoFigures}</p>
                ) : (
                  <ul className="flex flex-col gap-2 pb-2">
                    {known.map((key) => {
                      const value = totals.totals[key] ?? 0;
                      const reference = targets[key];
                      return (
                        <li key={key}>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-body-small text-ink-soft">
                              {all.nutrition.names[key]}
                            </span>
                            <span className="font-display quantity text-body whitespace-nowrap">
                              {formatNutrient(
                                key,
                                value,
                                totals.estimated,
                                locale,
                                isPartial(totals, key),
                              )}
                            </span>
                          </div>
                          <div aria-hidden="true" className="weave-bare relative mt-1.5 h-1">
                            <div
                              className="bg-ink-soft absolute inset-y-0 left-0 rounded-full"
                              style={{ width: `${barFill(value, reference) * 100}%` }}
                            />
                            <div
                              className="bg-ink absolute -inset-y-1 w-px"
                              style={{ left: `${REFERENCE_TICK * 100}%` }}
                            />
                          </div>
                          <span className="sr-only">
                            {fill(
                              personal ? all.nutrition.referencePersonal : all.nutrition.reference,
                              {
                                percent: String(Math.round((value / reference) * 100)),
                                reference: formatReference(key, reference, locale),
                              },
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
