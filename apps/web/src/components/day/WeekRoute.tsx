import type { EpochMs } from '@anc/core';
import { isSameLocalDay } from '@anc/core';
import { useLayoutEffect, useRef, useState } from 'react';
import { useStrings } from '../../i18n';
import { LINES } from '../primitives';
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

/** A towel with nothing logged: dashed and neutral. */
const EDGE_EMPTY = 'border-control border-dashed';
const EDGE = 'border-ink';
/** The day showing is outlined in ink: a shape around the towel, never a colour change alone. */
const SELECTED = 'outline outline-2 outline-offset-[3px] outline-ink';

function foldClass(d: WeekDayData, current: boolean): string {
  const edge = dayKind(d) === 'empty' ? EDGE_EMPTY : EDGE;
  return current ? `${edge} ${SELECTED}` : edge;
}

/**
 * The phone dock's day switcher: seven folded towels. Each shows a stripe for every food group
 * that appeared that day, in fixed order; a towel with a small ink knot means logged but no group;
 * a dashed towel means nothing logged. The day showing is outlined; today's label is underlined.
 * Each towel is one button.
 *
 * ARIA: the stop showing is `aria-current="true"` (the nav's current item); "today" is part of the
 * accessible name, never a second aria-current value, so today and the selection never collide.
 *
 * Reflow: seven 48 px towels need 336 px (21rem). Narrower than that (a 320 px phone, or 400 %
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
      <div className="relative flex w-full min-w-[21rem] items-center">
        {days.map((d) => {
          const current = isSameLocalDay(d.date, selected);
          return (
            <button
              key={d.date}
              type="button"
              aria-label={dayRouteLabel(d)}
              aria-current={current ? 'true' : undefined}
              onClick={() => onSelectDay(d.date)}
              className={`font-display relative flex min-h-19 min-w-[48px] flex-1 cursor-pointer flex-col items-center justify-start gap-1.5 bg-transparent pt-3.5 text-tag ${current || d.isToday ? 'text-ink font-bold' : 'text-thread font-semibold'}`}
            >
              <span
                aria-hidden="true"
                data-day-kind={dayKind(d)}
                className={`bg-raised relative flex h-8 w-6.5 flex-col justify-center gap-[3px] rounded-[3px] border-[1.5px] ${foldClass(d, current)}`}
              >
                {LINES.map((l) => (
                  <span
                    key={l.group}
                    className={`block h-[3px] ${d.groups.includes(l.group) ? l.bg : 'bg-transparent'}`}
                  />
                ))}
                {dayKind(d) === 'loggedNoLine' && (
                  <span
                    data-logged-core
                    className="bg-ink absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full"
                  />
                )}
              </span>
              {/* Today's word only where its stop is wide enough for it (measured, since the word's
                length depends on the language); otherwise the day's short name (drawn by CSS from
                data-initial, so the text stays "Today"). All hidden from AT: the button's name
                already says "today". */}
              <span
                aria-hidden="true"
                data-route-label
                data-initial={weekdayAbbr(d.date)}
                className={[
                  d.isToday && !wordFits ? 'before:content-[attr(data-initial)]' : '',
                  d.isToday ? 'decoration-ink underline decoration-2 underline-offset-4' : '',
                ].join(' ')}
              >
                {d.isToday ? (
                  <span className={wordFits ? undefined : 'hidden'}>{s.today}</span>
                ) : (
                  weekdayAbbr(d.date)
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
