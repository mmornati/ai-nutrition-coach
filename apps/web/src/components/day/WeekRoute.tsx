import type { EpochMs } from '@anc/core';
import { isSameLocalDay } from '@anc/core';
import { useStrings } from '../../i18n';
import { weekdayAbbr } from './format';
import { dayKind, dayRouteLabel } from './week';
import type { WeekDayData } from './week';

export interface WeekRouteProps {
  /** Seven days, oldest first, ending today. */
  readonly days: readonly WeekDayData[];
  /** The selected day (any instant within it). */
  readonly selected: EpochMs;
  readonly onSelectDay: (date: EpochMs) => void;
  readonly className?: string;
}

const DOT_TODAY =
  'border-line-starch bg-line-starch shadow-[0_0_0_3px_var(--color-enamel-raised),0_0_0_5px_var(--color-line-starch)]';
const DOT_FULL = 'border-porcelain bg-porcelain';
const DOT_PARTIAL = 'border-porcelain bg-enamel-raised';
/** Nothing logged: dashed and neutral, distinct from the hollow partial dot. */
const DOT_EMPTY = 'border-signal-muted border-dashed bg-enamel-raised';
/** Hollow like empty, but with a solid core: something was logged, no line stopped. */
const DOT_LOGGED = 'border-porcelain bg-enamel-raised';
const RING = 'shadow-[0_0_0_3px_var(--color-enamel-raised),0_0_0_5px_var(--color-porcelain)]';

function dotClass(d: WeekDayData, current: boolean): string {
  const kind = dayKind(d);
  const base = d.isToday
    ? DOT_TODAY
    : kind === 'full'
      ? DOT_FULL
      : kind === 'loggedNoLine'
        ? DOT_LOGGED
        : kind === 'empty'
          ? DOT_EMPTY
          : DOT_PARTIAL;
  return current && !d.isToday ? `${base} ${RING}` : base;
}

/**
 * The phone dock's day switcher: seven stops on a track. Filled means all four lines stopped
 * that day, hollow means fewer; a hollow stop with a solid core means logged but no line
 * stopped; a dashed dot means nothing logged; today is amber. Each stop is one button.
 *
 * ARIA: the stop showing is `aria-current="true"` (the nav's current item); "today" is part of the
 * accessible name, never a second aria-current value, so today and the selection never collide.
 */
export function WeekRoute({ days, selected, onSelectDay, className = '' }: WeekRouteProps) {
  const s = useStrings().week;
  return (
    <nav
      aria-label={s.routeLabel}
      className={`@container relative flex items-center pr-1.5 pl-3 before:absolute before:top-7.25 before:right-5.5 before:left-6 before:h-1 before:bg-rule before:content-[''] ${className}`}
    >
      {days.map((d) => {
        const current = isSameLocalDay(d.date, selected);
        return (
          <button
            key={d.date}
            type="button"
            aria-label={dayRouteLabel(d)}
            aria-current={current ? 'true' : undefined}
            onClick={() => onSelectDay(d.date)}
            className={`font-display relative flex min-h-19 min-w-0 flex-1 cursor-pointer flex-col items-center justify-start gap-1.5 bg-transparent pt-5 text-tag font-semibold tracking-[0.08em] uppercase ${current ? 'text-porcelain' : 'text-signal-muted'}`}
          >
            <span
              aria-hidden="true"
              data-day-kind={dayKind(d)}
              className={`relative block h-5 w-5 rounded-full border-[3.5px] ${dotClass(d, current)}`}
            >
              {dayKind(d) === 'loggedNoLine' && (
                <span
                  data-logged-core
                  className={`absolute inset-1 rounded-full ${d.isToday ? 'bg-enamel' : 'bg-porcelain'}`}
                />
              )}
            </span>
            {/* Today's word only where a stop is wide enough for it; otherwise the day's initial
                (drawn by CSS from data-initial, so the text stays "Today"). Both are hidden from
                AT: the button's name already says "today". */}
            <span
              aria-hidden="true"
              data-route-label
              data-initial={weekdayAbbr(d.date).charAt(0)}
              className={
                d.isToday
                  ? 'before:content-[attr(data-initial)] @min-[21rem]:before:content-none'
                  : undefined
              }
            >
              {d.isToday ? (
                <span className="hidden @min-[21rem]:inline">{s.today}</span>
              ) : (
                weekdayAbbr(d.date).charAt(0)
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
