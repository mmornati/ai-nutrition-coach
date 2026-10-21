import {
  DayList,
  NoStreaksLine,
  WeekNetwork,
  WeekNoteText,
  weekNoteParts,
} from '../../components/day';
import { formatDaySpan } from '../../components/day/format';
import { useStrings } from '../../i18n';
import { useDay } from '../../app/day-context';
import { hrefs, navigate, TODAY_HASH } from '../../app/router';
import { WeekReview } from './WeekReview';
import { BackToToday, ScreenFrame, ScreenHeader } from '../../app/ScreenFrame';

/**
 * Week: the seven days as four lines (which lines served each day, in words as well as
 * colour) and a day-by-day list. Choosing a day shows it on Today. No streaks, no score.
 */
export function WeekScreen() {
  const all = useStrings();
  const w = all.week;
  const day = useDay();
  const first = day.days[0];
  const last = day.days[day.days.length - 1];
  const note = weekNoteParts(day.days);
  return (
    <ScreenFrame
      current="week"
      header={
        <ScreenHeader
          back={<BackToToday />}
          title={w.title}
          {...(first && last ? { sub: formatDaySpan(first.date, last.date) } : {})}
        />
      }
    >
      <div className="max-w-3xl px-5 pt-6 pb-6 lg:px-7">
        <WeekNetwork days={day.days} />
        <WeekNoteText lead={note.lead} detail={note.detail} className="mt-4" />
        <WeekReview className="mt-8" />
        <a
          href={hrefs.coach}
          className="text-porcelain-dim mt-2 inline-flex min-h-12 items-center text-lead underline underline-offset-4"
        >
          {w.askCoachLink}
        </a>
        <h2 className="font-display text-section text-signal-muted mt-8 mb-2 uppercase">
          {w.dayByDay}
        </h2>
        <DayList
          days={day.days}
          onSelectDay={(date) => {
            day.select(date);
            navigate(TODAY_HASH);
          }}
        />
        <NoStreaksLine className="mt-4" />
      </div>
    </ScreenFrame>
  );
}
