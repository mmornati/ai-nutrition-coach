import type { EpochMs } from '@anc/core';
import { isSameLocalDay } from '@anc/core';
import { weekdayAbbr } from './format';
import { dayRouteLabel, isFullDay } from './week';
import type { WeekDayData } from './week';
import { dayStrings } from './strings';

export interface WeekRouteProps {
  /** Seven days, oldest first, ending today. */
  readonly days: readonly WeekDayData[];
  /** The selected day (any instant within it). */
  readonly selected: EpochMs;
  readonly onSelectDay: (date: EpochMs) => void;
  readonly className?: string;
}

/**
 * The phone dock's day switcher: seven stops on a track. Filled means all four lines stopped
 * that day, hollow means fewer; today is amber. Each stop is one button.
 */
export function WeekRoute({ days, selected, onSelectDay, className = '' }: WeekRouteProps) {
  return (
    <nav
      aria-label={dayStrings.routeLabel}
      className={`relative flex items-center pr-1.5 pl-3 before:absolute before:top-[29px] before:right-[22px] before:left-6 before:h-1 before:bg-rule before:content-[''] ${className}`}
    >
      {days.map((d) => {
        const current = isSameLocalDay(d.date, selected);
        const dot = d.isToday
          ? 'border-line-starch bg-line-starch shadow-[0_0_0_3px_var(--color-enamel-raised),0_0_0_5px_var(--color-line-starch)]'
          : isFullDay(d)
            ? 'border-porcelain bg-porcelain'
            : 'border-porcelain bg-enamel-raised';
        const ring =
          current && !d.isToday
            ? 'shadow-[0_0_0_3px_var(--color-enamel-raised),0_0_0_5px_var(--color-porcelain)]'
            : '';
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
              className={`block h-5 w-5 rounded-full border-[3.5px] ${dot} ${ring}`}
            />
            <span aria-hidden="true">{d.isToday ? dayStrings.today : weekdayAbbr(d.date)[0]}</span>
          </button>
        );
      })}
    </nav>
  );
}
