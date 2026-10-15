import type { EpochMs } from '@anc/core';
import { isSameLocalDay } from '@anc/core';
import { useLayoutEffect, useRef, useState } from 'react';
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
 *
 * Reflow: seven 48 px stops need 336 px (21rem). Narrower than that (a 320 px phone, or 400 %
 * zoom) the route scrolls sideways inside the dock instead of sticking out of it: the selected
 * stop (today, unless another day was picked) is kept fully in view and the far stop peeks in at
 * the edge, so the route reads as one that goes on. Tab and a tap on the peeking stop bring it in.
 */
export function WeekRoute({ days, selected, onSelectDay, className = '' }: WeekRouteProps) {
  const s = useStrings().week;
  const nav = useRef<HTMLElement>(null);
  // Today's word ("Today", "Aujourd’hui") is shown only when it fits inside its stop.
  const [wordFits, setWordFits] = useState(false);
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const fit = () => {
      const word = el.querySelector<HTMLElement>('[data-measure]');
      const stop = word?.closest('button');
      if (word && stop)
        setWordFits(word.offsetWidth > 0 && word.offsetWidth <= stop.clientWidth - 4);
    };
    // Only the route scrolls (scrollIntoView could also move the page).
    const pin = () => {
      const stop = el.querySelector<HTMLElement>('[aria-current="true"]');
      if (!stop) return;
      const left = stop.offsetLeft;
      const right = left + stop.offsetWidth;
      if (left < el.scrollLeft) el.scrollLeft = left;
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
    };
    fit();
    pin();
    // A rotation, a zoom or a resized window can narrow the route after it was drawn.
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => {
      fit();
      pin();
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [selected, s.today]);
  return (
    <nav
      ref={nav}
      aria-label={s.routeLabel}
      data-scroll-x
      className={`overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      <div className="relative flex w-full min-w-[21rem] items-center before:absolute before:top-7.25 before:right-[calc(100%/14)] before:left-[calc(100%/14)] before:h-1 before:bg-rule before:content-['']">
        {days.map((d) => {
          const current = isSameLocalDay(d.date, selected);
          return (
            <button
              key={d.date}
              type="button"
              aria-label={dayRouteLabel(d)}
              aria-current={current ? 'true' : undefined}
              onClick={() => onSelectDay(d.date)}
              className={`font-display relative flex min-h-19 min-w-[48px] flex-1 cursor-pointer flex-col items-center justify-start gap-1.5 bg-transparent pt-5 text-tag font-semibold tracking-[0.08em] uppercase ${current ? 'text-porcelain' : 'text-signal-muted'}`}
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
              {/* Today's word only where its stop is wide enough for it (measured, since the word's
                length depends on the language); otherwise the day's initial (drawn by CSS from
                data-initial, so the text stays "Today"). All hidden from AT: the button's name
                already says "today". */}
              <span
                aria-hidden="true"
                data-route-label
                data-initial={weekdayAbbr(d.date).charAt(0)}
                className={
                  d.isToday && !wordFits ? 'before:content-[attr(data-initial)]' : undefined
                }
              >
                {d.isToday ? (
                  <span className={wordFits ? undefined : 'hidden'}>{s.today}</span>
                ) : (
                  weekdayAbbr(d.date).charAt(0)
                )}
              </span>
              {d.isToday && (
                // The ruler: the word drawn invisibly (as CSS content, so it is not text), anchored
                // right so it never widens the route.
                <span
                  aria-hidden="true"
                  data-measure
                  data-word={s.today}
                  className="pointer-events-none invisible absolute top-0 right-0 whitespace-nowrap before:content-[attr(data-word)]"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
