import type { EpochMs } from '@anc/core';
import { isSameLocalDay } from '@anc/core';
import { useStrings } from '../../i18n';
import { weekdayAbbr } from './format';
import { dayRouteLabel, isFullDay } from './week';
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
const RING = 'shadow-[0_0_0_3px_var(--color-enamel-raised),0_0_0_5px_var(--color-porcelain)]';

function dotClass(d: WeekDayData, current: boolean): string {
  const base = d.isToday ? DOT_TODAY : isFullDay(d) ? DOT_FULL : DOT_PARTIAL;
  return current && !d.isToday ? `${base} ${RING}` : base;
}

/**
 * The phone dock's day switcher: seven stops on a track. Filled means all four lines stopped
 * that day, hollow means fewer; today is amber. Each stop is one button.
 */
export function WeekRoute({ days, selected, onSelectDay, className = '' }: WeekRouteProps) {
  const s = useStrings().week;
  return (
    <nav
      aria-label={s.routeLabel}
      className={`relative flex items-center pr-1.5 pl-3 before:absolute before:top-[29px] before:right-[22px] before:left-6 before:h-1 before:bg-rule before:content-[''] ${className}`}
    >
      {days.map((d) => {
        const current = isSameLocalDay(d.date, selected);
        return (
          <button
            key={d.date}
            type="button"
            aria-label={dayRouteLabel(d)}
            aria-current={current ? 'date' : undefined}
            onClick={() => onSelectDay(d.date)}
            className={`font-display relative flex min-h-19 min-w-0 flex-1 cursor-pointer flex-col items-center justify-start gap-1.5 bg-transparent pt-5 text-[13px] font-semibold tracking-[0.08em] uppercase ${current ? 'text-porcelain' : 'text-signal-muted'}`}
          >
            <span
              aria-hidden="true"
              className={`block h-5 w-5 rounded-full border-[3.5px] ${dotClass(d, current)}`}
            />
            <span aria-hidden="true">{d.isToday ? s.today : weekdayAbbr(d.date)[0]}</span>
          </button>
        );
      })}
    </nav>
  );
}
