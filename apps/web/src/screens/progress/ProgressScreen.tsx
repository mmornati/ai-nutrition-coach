import { useId, useState } from 'react';
import { dayNumberOf, localDayText, weighInIsStale, type BodyMeasurement } from '@anc/core';
import { ConfirmDialog } from '../../components/dialogs';
import { Button } from '../../components/primitives';
import { useShowNumbers } from '../../components/nutrition';
import { fill, useLocale, useStrings } from '../../i18n';
import { useDay, useNoticeTimeout } from '../../app/day-context';
import { hrefs } from '../../app/router';
import { BackToToday, ScreenFrame, ScreenHeader } from '../../app/ScreenFrame';
import { useSession } from '../../app/session';
import { ChoiceGroup } from '../settings/ChoiceGroup';
import { formatDay } from '../settings/ProfileBodySection';
import { SECTIONS } from '../settings/sections';
import { IntakeHistory } from './IntakeHistory';
import { PaceNotice } from './PaceNotice';
import { TrendChart } from './TrendChart';
import { WeighInSheet, type WeighInTarget } from './WeighInSheet';
import {
  RANGE_DAYS,
  RANGE_KEYS,
  longestGap,
  GAP_DAYS,
  pointsInRange,
  type RangeKey,
} from './chart-model';
import { paceSentence, trendSentence } from './trend-text';
import { useMeasurements, useUnits, useWeightProgress } from './use-weight-progress';
import { waistText as waistTextOf, weightText } from './weight-format';

const SHORT_LIST = 8;

/**
 * One kind of measurement as a list of dated entries, newest first, each with Edit and Remove. The
 * values are shown only while nutrition numbers are on; with them hidden the entry is still named by
 * its date and can still be edited or removed.
 */
function History({
  title,
  kind,
  entries,
  ignoredDays,
  onEdit,
  onRemove,
}: {
  readonly title: string;
  readonly kind: 'weight' | 'waist';
  readonly entries: readonly BodyMeasurement[];
  /** Days of weigh-ins the trend leaves out as typing slips: listed, marked, still editable. */
  readonly ignoredDays?: ReadonlySet<string>;
  readonly onEdit: (entry: BodyMeasurement) => void;
  readonly onRemove: (entry: BodyMeasurement) => void;
}) {
  const all = useStrings();
  const s = all.progress;
  const { locale } = useLocale();
  const units = useUnits();
  const showNumbers = useShowNumbers();
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;
  const shown = expanded ? entries : entries.slice(0, SHORT_LIST);
  const valueText = (m: BodyMeasurement): string =>
    kind === 'weight'
      ? weightText(m.value, units, locale, all.profile)
      : waistTextOf(m.value, units, locale, all.profile);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-section text-thread">{title}</h2>
      <ul className="border-ink flex flex-col border-t-2">
        {shown.map((m) => {
          const date = formatDay(m.day, locale);
          const unused = kind === 'weight' && ignoredDays?.has(m.day) === true;
          return (
            <li
              key={m.day}
              className="border-seam flex min-h-12 flex-wrap items-center justify-between gap-x-3 border-b"
            >
              <span className="text-body">
                {showNumbers
                  ? fill(s.rowWeighIn, { date, value: valueText(m) })
                  : fill(kind === 'weight' ? s.hiddenValue : s.hiddenWaist, { date })}
                {unused ? ` (${s.notUsed})` : ''}
              </span>
              <span className="flex">
                <button
                  type="button"
                  aria-label={fill(
                    kind === 'weight' ? all.weighIn.editWeight : all.weighIn.editWaist,
                    { date },
                  )}
                  onClick={() => onEdit(m)}
                  className="text-ink inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center bg-transparent text-body-small underline underline-offset-4"
                >
                  {all.weighIn.edit}
                </button>
                <button
                  type="button"
                  aria-label={fill(kind === 'weight' ? s.removeWeight : s.removeWaist, { date })}
                  onClick={() => onRemove(m)}
                  className="text-ink inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center bg-transparent text-body-small underline underline-offset-4"
                >
                  {all.common.remove}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {entries.length > SHORT_LIST && (
        <div>
          <Button variant="secondary" onClick={() => setExpanded((v) => !v)}>
            {expanded ? s.showFewer : fill(s.showAll, { count: entries.length })}
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * Progress: the weight trend and its history, and what was logged each day. Everything here
 * describes and nothing grades: no target, no streak, no colour for better or worse (docs/adr/0008).
 * The weigh-in sheet opens from here and from Today.
 */
export function ProgressScreen() {
  const all = useStrings();
  const s = all.progress;
  const { locale } = useLocale();
  const { profile: pref, clock, live } = useSession();
  const day = useDay();
  const units = useUnits();
  const showNumbers = useShowNumbers();
  const progress = useWeightProgress();
  const body = useMeasurements();
  const [range, setRange] = useState<RangeKey>('fourWeeks');
  const [sheet, setSheet] = useState<{ readonly target?: WeighInTarget } | null>(null);
  const [removing, setRemoving] = useState<BodyMeasurement | null>(null);
  const summaryId = useId();
  useNoticeTimeout(day.notice, () => day.setNotice(null));

  const todayText = localDayText(clock());
  const todayNumber = dayNumberOf(todayText);
  const points = pointsInRange(progress.series, range, todayNumber);
  const weights = body.filter((m) => m.kind === 'weight');
  const waists = body.filter((m) => m.kind === 'waist');
  const latest = progress.latest;
  const ctx = { units, locale, all };
  const rangeDays = RANGE_DAYS[range];
  const ignored = weights
    .filter(
      (m) =>
        progress.ignoredDays.has(m.day) &&
        (rangeDays === null || dayNumberOf(m.day) >= todayNumber - rangeDays),
    )
    .map((m) => ({ day: m.day, value: m.value }));
  const pace = showNumbers ? paceSentence(progress, ctx) : null;
  const waistFirst = waists[waists.length - 1];
  const waistLatest = waists[0];
  const waistText = (m: BodyMeasurement): string =>
    waistTextOf(m.value, units, locale, all.profile);

  const remove = async (entry: BodyMeasurement): Promise<void> => {
    setRemoving(null);
    try {
      await pref.removeMeasurement(entry.kind, entry.day);
      if (live()) day.setNotice((a) => a.weighIn.removed);
    } catch {
      if (live()) day.setNotice((a) => a.weighIn.saveFailed);
    }
  };

  return (
    <ScreenFrame
      current="progress"
      header={<ScreenHeader back={<BackToToday />} title={s.title} />}
    >
      <div className="flex max-w-3xl flex-col gap-7 px-5 pt-6 pb-8 lg:px-7">
        <p className="text-body text-ink-soft">{s.intro}</p>
        <p role="status" className="text-thread text-meta empty:hidden">
          {day.notice}
        </p>
        <div>
          <Button variant="secondary" onClick={() => setSheet({})}>
            {s.addWeighIn}
          </Button>
        </div>
        <PaceNotice />

        {!showNumbers ? (
          <p className="text-body-small text-ink-soft">
            {s.numbersOff}{' '}
            <a
              href={hrefs.section(SECTIONS.nutrition)}
              className="text-ink inline-flex min-h-12 items-center underline underline-offset-4"
            >
              {s.numbersOffLink}
            </a>
          </p>
        ) : (
          <>
            <ChoiceGroup<RangeKey>
              label={s.rangeLabel}
              choices={RANGE_KEYS.map((value) => ({ value, label: s.ranges[value] }))}
              value={range}
              onChange={setRange}
            />
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-section text-thread">{s.weightTitle}</h2>
              <p id={summaryId} className="text-lead">
                {trendSentence(progress, ctx)}
              </p>
              {pace !== null && <p className="text-body-small text-ink-soft">{pace}</p>}
              {latest !== null && weighInIsStale(latest.day, todayText) && (
                <p className="text-body-small text-ink-soft">
                  {fill(s.stale, { date: formatDay(latest.day, locale) })}
                </p>
              )}
              {points.length > 0 ? (
                <>
                  <TrendChart
                    points={points}
                    units={units}
                    range={range}
                    todayNumber={todayNumber}
                    summaryId={summaryId}
                    ignored={ignored}
                  />
                  {longestGap(points) >= GAP_DAYS && (
                    <p className="text-body-small text-ink-soft">{s.gaps}</p>
                  )}
                </>
              ) : (
                latest !== null && <p className="text-body-small text-ink-soft">{s.outsideRange}</p>
              )}
            </section>
          </>
        )}

        <History
          title={s.historyTitle}
          kind="weight"
          entries={weights}
          ignoredDays={progress.ignoredDays}
          onEdit={(m) => setSheet({ target: { day: m.day, kind: 'weight' } })}
          onRemove={setRemoving}
        />
        {progress.ignoredDays.size > 0 && (
          <p className="text-body-small text-ink-soft">{s.notUsedNote}</p>
        )}
        <History
          title={s.waistHistoryTitle}
          kind="waist"
          entries={waists}
          onEdit={(m) => setSheet({ target: { day: m.day, kind: 'waist' } })}
          onRemove={setRemoving}
        />
        {showNumbers && waistFirst !== undefined && waistLatest !== undefined && (
          <p className="text-body-small text-ink-soft">
            {waists.length >= 2
              ? fill(s.waistFirstLatest, {
                  first: waistText(waistFirst),
                  firstDate: formatDay(waistFirst.day, locale),
                  latest: waistText(waistLatest),
                  latestDate: formatDay(waistLatest.day, locale),
                })
              : fill(s.waistOne, {
                  value: waistText(waistLatest),
                  date: formatDay(waistLatest.day, locale),
                })}
          </p>
        )}

        {showNumbers && (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-section text-thread">{s.intakeTitle}</h2>
            <IntakeHistory range={range} />
          </section>
        )}
      </div>
      <ConfirmDialog
        open={removing !== null}
        title={all.weighIn.removeTitle}
        body={
          removing !== null && (
            <p>
              {fill(
                removing.kind === 'weight'
                  ? all.weighIn.removeBodyWeight
                  : all.weighIn.removeBodyWaist,
                { date: formatDay(removing.day, locale) },
              )}
            </p>
          )
        }
        confirmLabel={all.common.remove}
        dismissLabel={all.weighIn.removeKeep}
        onConfirm={() => removing !== null && void remove(removing)}
        onDismiss={() => setRemoving(null)}
      />
      <WeighInSheet open={sheet !== null} onClose={() => setSheet(null)} target={sheet?.target} />
    </ScreenFrame>
  );
}
